import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface OhlcBar { date:string; open:number; high:number; low:number; close:number; volume:number }
interface CpdMark { date:string; window:number; score:number; change_type:string|null; estimated_change_date:string|null; detection_lag_bars:number|null; passed_gates:boolean }
interface ChartData { stock:{stock_id:number;symbol:string;company_name:string}; bars:OhlcBar[]; markers:CpdMark[]; source_note:string }

@Component({selector:'app-cpd-stock-chart',standalone:true,template:'<div class="cpd-tv-chart-wrap"><div #chart class="cpd-tv-chart" role="img" aria-label="Daily candlestick chart with CPD markers"></div>@if(loading()){<div class="cpd-tv-overlay">Loading stored daily prices…</div>}@if(error()){<div class="cpd-tv-overlay text-danger">{{error()}}</div>}</div>',styles:[':host{display:block}.cpd-tv-chart-wrap{position:relative;width:100%;height:520px}.cpd-tv-chart{position:absolute;inset:0;width:100%;height:100%}.cpd-tv-overlay{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;background:rgb(255 255 255 / 90%);color:#697586;font-size:.85rem}@media(max-width:575.98px){.cpd-tv-chart-wrap{height:420px}}']})
export class CpdStockChart implements AfterViewInit,OnChanges,OnDestroy {
 @Input() stockId=0;
 @Input() configId=0;
 @Input() symbol='';
 @Input() threshold=.95;
 @Input() windows:number[]=[21,63,121];
 @ViewChild('chart',{static:true}) chartElement!:ElementRef<HTMLDivElement>;
 private http=inject(HttpClient);private widget:any;private viewReady=false;private request=0;private data:ChartData|null=null;private markerSubscription:any;private shapeIds:any[]=[];private renderVersion=0;
 loading=signal(true);error=signal('');

 ngAfterViewInit(){this.viewReady=true;this.reload()}
 ngOnChanges(changes:SimpleChanges){if(!this.viewReady)return;if(changes['stockId']||changes['configId'])this.reload();else if(changes['threshold']||changes['windows'])this.renderMarkers()}
 ngOnDestroy(){this.request++;this.widget?.remove?.();this.widget=null}

 private async reload(){
  const token=++this.request;this.widget?.remove?.();this.widget=null;this.data=null;this.loading.set(true);this.error.set('');
  try{
   await this.loadLibrary();
   const data=await firstValueFrom(this.http.get<ChartData>(`/api/screeners/cpd/stocks/${this.stockId}/chart-data`,{params:{config_id:this.configId}}));
   if(token!==this.request)return;this.data=data;
   const global=(window as any).TradingView;
   this.widget=new global.widget({container:this.chartElement.nativeElement,library_path:'/tradingview/charting_library/',datafeed:this.makeDatafeed(data),symbol:this.symbol||data.stock.symbol,interval:'1D',autosize:true,locale:'en',timezone:'Asia/Kolkata',theme:'Light',toolbar_bg:'#ffffff',disabled_features:['use_localstorage_for_settings','header_saveload','header_symbol_search','header_compare','header_screenshot','header_fullscreen_button'],overrides:{'paneProperties.background':'#ffffff','paneProperties.backgroundType':'solid','paneProperties.vertGridProperties.color':'#f0f2f5','paneProperties.horzGridProperties.color':'#f0f2f5','scalesProperties.textColor':'#667085','mainSeriesProperties.candleStyle.upColor':'#18866f','mainSeriesProperties.candleStyle.downColor':'#d46666','mainSeriesProperties.candleStyle.borderUpColor':'#18866f','mainSeriesProperties.candleStyle.borderDownColor':'#d46666','mainSeriesProperties.candleStyle.wickUpColor':'#18866f','mainSeriesProperties.candleStyle.wickDownColor':'#d46666'},loading_screen:{backgroundColor:'#ffffff',foregroundColor:'#0204bc'}});
   this.widget.chartReady().then(()=>{if(token!==this.request)return;this.loading.set(false);const chart=this.widget.activeChart();chart.clearMarks();chart.removeAllShapes();this.markerSubscription=chart.onVisibleRangeChanged();this.markerSubscription.subscribe(this,this.onVisibleRangeChange);this.renderMarkers()});
  }catch{if(token===this.request){this.loading.set(false);this.error.set('Unable to load this stock’s chart. Check stored OHLCV availability and API access.')}}
 }

 private async loadLibrary(){
  const w=window as any;if(w.TradingView)return;
  if(!w.__arinalphaTradingViewLoad){w.__arinalphaTradingViewLoad=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='/tradingview/charting_library/charting_library.standalone.js';script.async=true;script.onload=()=>resolve();script.onerror=()=>reject(new Error('Chart library failed to load'));document.head.appendChild(script)})}
  await w.__arinalphaTradingViewLoad;
 }

 private makeDatafeed(data:ChartData){
  const bars=data.bars.map(bar=>({...bar,time:Date.parse(`${bar.date}T00:00:00Z`)})).sort((a,b)=>a.time-b.time);
  const info={name:data.stock.symbol,ticker:data.stock.symbol,description:data.stock.company_name,type:'stock',session:'0915-1530',timezone:'Asia/Kolkata',exchange:'NSE',listed_exchange:'NSE',minmov:1,pricescale:100,format:'price',has_intraday:false,has_daily:true,has_weekly_and_monthly:false,supported_resolutions:['1D'],volume_precision:0,data_status:'endofday'};
  return {onReady:(callback:(cfg:unknown)=>void)=>setTimeout(()=>callback({supported_resolutions:['1D'],supports_marks:false,supports_time:false}),0),searchSymbols:(_input:string,_exchange:string,_type:string,callback:(rows:unknown[])=>void)=>callback([]),resolveSymbol:(_name:string,resolve:(symbol:unknown)=>void)=>setTimeout(()=>resolve(info),0),
   getBars:(_symbol:unknown,_resolution:string,period:{from:number;to:number},callback:(rows:unknown[],meta:{noData:boolean})=>void,error:(message:string)=>void)=>{try{const rows=bars.filter(bar=>bar.time/1000>=period.from&&bar.time/1000<period.to);callback(rows,{noData:rows.length===0})}catch{error('OHLCV bars are unavailable')}},
   subscribeBars:()=>{},unsubscribeBars:()=>{}};
 }

 private onVisibleRangeChange=()=>this.renderMarkers();

 private renderMarkers(){
  if(!this.data||!this.widget)return;
  const chart=this.widget.activeChart();const version=++this.renderVersion;
  for(const id of this.shapeIds)chart.removeEntity(id);this.shapeIds=[];
  const selected=new Set(this.windows);
  const eligible=this.data.markers.filter(mark=>mark.score>=this.threshold&&selected.has(mark.window));
  const grouped=new Map<string,CpdMark[]>();
  for(const mark of eligible){const group=grouped.get(mark.date)||[];group.push(mark);grouped.set(mark.date,group)}
  let range:{from:number;to:number}|null=null;try{range=chart.getVisibleRange?.()||null}catch{}
  const rgb:Record<number,string>={21:'2,4,188',63:'18,130,119',121:'218,142,48'};
  const groups=[...grouped.entries()].filter(([date])=>{const time=Date.parse(`${date}T00:00:00Z`)/1000;return !range||(time>=range.from&&time<=range.to)});
  for(const [date,observations] of groups){
   const dominant=[...observations].sort((a,b)=>b.score-a.score)[0];const time=Date.parse(`${date}T00:00:00Z`)/1000;
   const tint=`rgba(${rgb[dominant.window]||'2,4,188'},0.2)`;
   chart.createShape({time},{shape:'vertical_line',disableSelection:true,disableSave:true,disableUndo:true,showInObjectsTree:false,zOrder:'bottom',overrides:{linecolor:tint,linewidth:2,linestyle:0,showTime:false}}).then((id:any)=>{if(version===this.renderVersion)this.shapeIds.push(id);else chart.removeEntity(id)}).catch(()=>{});
  }
 }
}
