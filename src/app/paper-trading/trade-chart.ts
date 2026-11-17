import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { firstValueFrom } from "rxjs";

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

@Component({
  selector: "paper-trade-chart-page", standalone: true, imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header"><div class="container-fluid"><div class="row align-items-center g-2"><div class="col"><a routerLink="/paper-trading" class="text-secondary small">Paper trading</a><h2 class="page-title mt-1">{{trade()?.instrument_snapshot?.trading_symbol || 'Trade chart'}}</h2></div><div class="col-auto d-flex gap-2"><a class="btn btn-outline-secondary" routerLink="/paper-trading">Back to trades</a>@if(trade()?.status==='OPEN'){<button class="btn btn-outline-danger" (click)="exit()">Exit position</button>}@if(trade()?.status==='PENDING'||trade()?.status==='PARTIALLY_FILLED'){<button class="btn btn-outline-secondary" (click)="cancel()">Cancel order</button>}<a class="btn btn-primary" [routerLink]="['/paper-trading']" [queryParams]="{instrument_key:trade()?.instrument_key,open:'1'}">Buy more</a></div></div></div></div>
    <div class="page-body"><div class="container-fluid"><div class="row g-3">
      @if(error()){<div class="col-12"><div class="alert alert-danger">{{error()}}</div></div>}
      @if(trade();as t){<div class="col-12"><div class="card"><div class="card-body d-flex flex-wrap gap-4 align-items-center"><div><div class="subheader">POSITION</div><div class="fw-semibold">{{t.instrument_snapshot?.trading_symbol}}</div><div class="text-secondary small">{{t.source}} · {{t.instrument_snapshot?.segment || 'NSE'}}</div></div><div><div class="subheader">STATUS</div><span class="badge" [class.bg-green-lt]="t.status==='OPEN'" [class.bg-yellow-lt]="t.status==='PENDING'||t.status==='PARTIALLY_FILLED'" [class.bg-secondary-lt]="t.status==='CLOSED'">{{t.status}}</span></div><div><div class="subheader">QUANTITY</div><strong>{{t.remaining_quantity}} / {{t.quantity}}</strong></div><div><div class="subheader">ENTRY</div><strong>{{money(t.entry_price || t.limit_price)}}</strong></div><div><div class="subheader">LIVE MARK</div><strong>{{money(t.mark_price)}}</strong></div><div><div class="subheader">UNREALIZED</div><strong [class.text-green]="pnl(t)>=0" [class.text-red]="pnl(t)<0">{{money(pnl(t))}} <span class="small">{{pct(t)}}%</span></strong></div><div><div class="subheader">STOP / TARGET</div><strong>{{money(t.stop_loss)}} / {{money(t.target_price)}}</strong></div></div></div></div>
      <div class="col-12"><div class="card chart-card"><div class="card-header flex-wrap gap-2"><div><h3 class="card-title">Price chart</h3><div class="text-secondary small">Historical candles with live quote updates · Asia/Kolkata</div></div><span class="badge ms-auto" [class.bg-green-lt]="feedState()==='LIVE'" [class.bg-secondary-lt]="feedState()!=='LIVE'">{{feedState()}}</span><div class="btn-group"><button class="btn btn-sm" [class.btn-primary]="interval()==='day'" [class.btn-outline-secondary]="interval()!=='day'" (click)="setInterval('day')">1D</button><button class="btn btn-sm" [class.btn-primary]="interval()==='60'" [class.btn-outline-secondary]="interval()!=='60'" (click)="setInterval('60')">1H</button><button class="btn btn-sm" [class.btn-primary]="interval()==='15'" [class.btn-outline-secondary]="interval()!=='15'" (click)="setInterval('15')">15m</button></div></div><div class="chart-wrap"><div #chart class="tv-chart"></div>@if(loading()){<div class="chart-cover">Loading historical candles…</div>}@if(chartError()){<div class="chart-cover text-danger">{{chartError()}}</div>}</div><div class="card-footer d-flex flex-wrap gap-3 text-secondary small"><span>Paper execution only</span><span>Entry {{money(trade()?.entry_price || trade()?.limit_price)}}</span><span>Stop {{money(trade()?.stop_loss)}}</span><span>Target {{money(trade()?.target_price)}}</span></div></div></div>
      }
    </div></div></div>`,
  styles: [`:host{display:block}.chart-card{overflow:hidden}.chart-wrap{position:relative;height:min(68vh,680px);min-height:360px}.tv-chart{position:absolute;inset:0}.chart-cover{position:absolute;inset:0;z-index:2;display:grid;place-items:center;background:rgba(255,255,255,.9);color:#667085}.subheader{font-size:.66rem;letter-spacing:.07em;color:#667085;margin-bottom:.3rem}@media(max-width:575.98px){.chart-wrap{height:55vh;min-height:320px}.card-body{gap:1rem!important}}`]
})
export class PaperTradeChartPage implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private chartElement?: ElementRef<HTMLDivElement>;
  @ViewChild("chart") set chartRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.chartElement = value;
    if (value && this.trade()) this.loadChart();
  }
  trade = signal<any>(null);
  loading = signal(true);
  chartError = signal("");
  error = signal("");
  interval = signal("day");
  private widget: any;
  private generation = 0;
  private viewReady = false;
  private socket?: WebSocket;
  private realtimeSubscribers = new Map<string, (bar: Bar) => void>();
  private latestBar: Bar | null = null;
  feedState = signal("CONNECTING");

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get("tradeId"));
    this.http.get<any>("/api/paper-trading/trades", { params: { limit: 500 } }).subscribe({
      next: response => {
        this.trade.set((response.items || []).find((row: any) => Number(row.id) === id) || null);
        if (!this.trade()) this.error.set("Trade not found in your paper-trading account.");
        else { this.connectFeed(this.trade().instrument_key); if (this.viewReady && this.chartElement) this.loadChart(); }
      }, error: () => this.error.set("Could not load this trade. Please return to the trade book.")
    });
  }

  ngAfterViewInit() { this.viewReady = true; this.loadChart(); }
  ngOnDestroy() { this.generation++; this.widget?.remove?.(); this.socket?.close(); this.realtimeSubscribers.clear(); }

  async setInterval(value: string) { this.interval.set(value); await this.loadChart(); }

  private async loadChart() {
    const trade = this.trade();
    if (!trade || !this.chartElement) return;
    const request = ++this.generation;
    this.loading.set(true); this.chartError.set(""); this.widget?.remove?.(); this.widget = null;
    try {
      await this.loadLibrary();
      const data = await firstValueFrom(this.http.get<any>("/api/market/candles", { params: { instrument_key: trade.instrument_key, interval: this.interval() } }));
      if (request !== this.generation) return;
      if (!data.bars?.length) throw new Error("No historical candles are available for this contract.");
      this.latestBar = data.bars[data.bars.length - 1];
      this.widget = new (window as any).TradingView.widget({
        container: this.chartElement.nativeElement, library_path: "/tradingview/charting_library/",
        datafeed: this.datafeed(data), symbol: trade.instrument_snapshot?.trading_symbol || data.instrument.trading_symbol,
        interval: this.interval() === "day" ? "1D" : this.interval(), autosize: true, locale: "en",
        timezone: "Asia/Kolkata", theme: "Light", toolbar_bg: "#ffffff",
        disabled_features: ["use_localstorage_for_settings", "header_saveload", "header_symbol_search", "header_compare", "header_screenshot"],
        overrides: { "paneProperties.background": "#ffffff", "paneProperties.backgroundType": "solid", "paneProperties.vertGridProperties.color": "#f0f2f5", "paneProperties.horzGridProperties.color": "#f0f2f5", "scalesProperties.textColor": "#667085", "mainSeriesProperties.candleStyle.upColor": "#18866f", "mainSeriesProperties.candleStyle.downColor": "#d46666", "mainSeriesProperties.candleStyle.borderUpColor": "#18866f", "mainSeriesProperties.candleStyle.borderDownColor": "#d46666", "mainSeriesProperties.candleStyle.wickUpColor": "#18866f", "mainSeriesProperties.candleStyle.wickDownColor": "#d46666" },
        loading_screen: { backgroundColor: "#ffffff", foregroundColor: "#0204bc" }
      });
      this.widget.chartReady().then(() => { if (request === this.generation) this.loading.set(false); });
    } catch (err: any) {
      if (request === this.generation) {
        this.loading.set(false);
        this.chartError.set(err?.status === 404
          ? "The running FastAPI process does not have the chart endpoint yet. Restart the backend and try again."
          : err?.error?.detail || err?.message || "Unable to load historical candles.");
      }
    }
  }

  private datafeed(data: any) {
    const bars: Bar[] = data.bars;
    const resolution = this.interval() === "day" ? "1D" : this.interval();
    const symbolInfo = { name: data.instrument.trading_symbol, ticker: data.instrument.instrument_key,
      description: data.instrument.name || data.instrument.trading_symbol, type: "stock", session: "0915-1530",
      timezone: "Asia/Kolkata", exchange: "NSE", listed_exchange: "NSE", minmov: 1, pricescale: 100,
      has_intraday: true, has_daily: true, supported_resolutions: ["15", "60", "1D"], volume_precision: 0, data_status: "endofday" };
    return {
      onReady: (cb: (value: any) => void) => setTimeout(() => cb({ supported_resolutions: ["15", "60", "1D"], supports_marks: false }), 0),
      searchSymbols: (_q: string, _e: string, _t: string, cb: (value: any[]) => void) => cb([]),
      resolveSymbol: (_s: string, cb: (value: any) => void) => setTimeout(() => cb(symbolInfo), 0),
      getBars: (_s: unknown, _r: string, range: { from: number; to: number }, cb: (rows: Bar[], meta: any) => void, fail: (message: string) => void) => {
        try { const rows = bars.filter(bar => bar.time / 1000 >= range.from && bar.time / 1000 < range.to); cb(rows, { noData: rows.length === 0 }); }
        catch { fail("Historical candle data is unavailable"); }
      },
      subscribeBars: (_s: unknown, _r: string, callback: (bar: Bar) => void, uid: string) => this.realtimeSubscribers.set(uid, callback),
      unsubscribeBars: (uid: string) => this.realtimeSubscribers.delete(uid)
    };
  }

  private async loadLibrary() {
    const w = window as any; if (w.TradingView) return;
    if (!w.__arinalphaTradingViewLoad) w.__arinalphaTradingViewLoad = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script"); script.src = "/tradingview/charting_library/charting_library.standalone.js";
      script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("TradingView library failed to load")); document.head.appendChild(script);
    });
    await w.__arinalphaTradingViewLoad;
  }

  private connectFeed(key: string) {
    this.socket?.close();
    this.socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/paper-trading/feed`);
    this.socket.onopen = () => { this.feedState.set("CONNECTED"); this.socket?.send(JSON.stringify({ action: "subscribe", keys: [key], mode: "full" })); };
    this.socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === "status") this.feedState.set(message.data.state);
      if (message.type !== "quote" || message.data.instrument_key !== key) return;
      const last = Number(message.data.last_price);
      if (!Number.isFinite(last) || last <= 0) return;
      this.feedState.set("LIVE");
      this.trade.update((trade: any) => trade ? { ...trade, mark_price: last } : trade);
      const now = Date.now();
      const intervalMinutes = this.interval() === "day" ? 1440 : Number(this.interval());
      const offset = 330 * 60_000;
      const bucket = intervalMinutes === 1440
        ? Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) + "T00:00:00Z") - offset
        : Math.floor((now + offset) / (intervalMinutes * 60_000)) * intervalMinutes * 60_000 - offset;
      const previous = this.latestBar;
      const sameBar = previous && previous.time === bucket;
      const bar: Bar = { time: bucket, open: sameBar ? previous.open : previous?.close ?? last,
        high: Math.max(sameBar ? previous.high : last, last), low: Math.min(sameBar ? previous.low : last, last),
        close: last, volume: sameBar ? previous.volume : 0 };
      this.latestBar = bar;
      for (const callback of this.realtimeSubscribers.values()) callback(bar);
    };
    this.socket.onclose = () => this.feedState.set("DISCONNECTED");
    this.socket.onerror = () => this.feedState.set("UNAVAILABLE");
  }

  pnl(t: any) { return (Number(t.mark_price || 0) - Number(t.entry_price || 0)) * Number(t.remaining_quantity || 0); }
  pct(t: any) { const basis = Number(t.entry_price || 0) * Number(t.remaining_quantity || 0); return basis ? (this.pnl(t) / basis * 100).toFixed(2) : "0.00"; }
  money(value: any) { const n = Number(value); return Number.isFinite(n) && value != null ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n) : "—"; }
  exit() { const t = this.trade(); if (!t) return; this.http.post(`/api/paper-trading/trades/${t.id}/close`, {}).subscribe({ next: () => location.reload(), error: e => this.error.set(e?.error?.detail || "Could not exit this simulated position.") }); }
  cancel() { const t = this.trade(); if (!t) return; this.http.post(`/api/paper-trading/trades/${t.id}/cancel`, {}).subscribe({ next: () => location.reload(), error: e => this.error.set(e?.error?.detail || "Could not cancel this simulated order.") }); }
}
