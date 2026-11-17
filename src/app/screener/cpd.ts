import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CpdChart } from './cpd-chart';
import { CpdStockChart } from './cpd-stock-chart';
import { CpdTrendChart } from './cpd-trend-chart';

interface Stock { stock_id:number; symbol:string; company_name:string }
interface Settings { windows:number[]; forward_horizons:number[]; min_cpd_score:number }
interface Profile { id:number; name:string; is_default:boolean; selected_stock_ids:number[]; selected_stocks:Stock[]; settings:Settings }
interface WindowResult { window:number; estimated_change_date:string; change_boundary_date:string; detection_lag_bars:number; cpd_score:number; bic_gain:number; volatility_ratio:number; change_type:string; quality_ok:boolean; signal_passed_threshold:boolean; last_known_close:number|null }
interface Outcome { mature:boolean; maturity_date:string|null; forward_up_pct:number|null; forward_down_pct:number|null; forward_max_abs_pct:number|null; forward_close_return_pct:number|null; movement_increased:boolean|null }
interface Result { stock_id:number; symbol:string; company_name:string; signal_date:string; status:string; windows:WindowResult[]; outcomes:Record<string,Record<string,Outcome>>; source_note:string }
interface LatestSummary { stocks_scanned:number;stocks_with_signals:number;window_observations:number;passed_observations:number;expansions:number;contractions:number;missing_on_newest_attempt:number;by_window:{window:number;observations:number;passed:number;expansions:number;contractions:number;median_score:number|null;median_bic:number|null;median_detection_lag:number|null}[];trend:TrendPoint[];outcomes:{horizon:number;matured:number;range5_count:number;range5_rate:number|null;avg_up_pct:number|null;avg_down_pct:number|null;avg_close_pct:number|null}[] }
interface LatestResult extends Result { best_bic_gain:number;best_score:number }
interface LatestResponse { config_id:number;config:string;latest_date:string|null;newest_attempt_date:string|null;summary:LatestSummary;items:LatestResult[];total:number;offset:number;limit:number }
interface TrendPoint { signal_date:string; window:string; observations:number; passed:number }
interface WindowSummary { window:number; scans:number; passed:number; average_score:number|null; average_detection_lag:number|null; expansions:number; contractions:number }
interface HorizonSummary { horizon:number; matured_passed_observations:number; range_5pct_count:number; range_5pct_rate:number|null; average_forward_up_pct:number|null; average_forward_down_pct:number|null; average_forward_close_return_pct:number|null; movement_increased_count:number }
interface HistoryEntry { signal_date:string; status:string; windows:WindowResult[]; outcomes:Record<string,Record<string,Outcome>>; source_note:string }
interface StockDetail { stock:Stock; config:string; latest_date:string|null; summary:{scanned_sessions:number;sessions_with_passed_windows:number;passed_window_observations:number;by_window:WindowSummary[];outcomes:HorizonSummary[]}; timeline:{date:string;scores:Record<string,number>;close:number|null}[]; history:HistoryEntry[]; total:number; limit:number; offset:number }
interface Run { job_name:string; status:string; message:string|null; finished_at:string|null }

@Component({selector:'app-cpd',standalone:true,imports:[CommonModule,FormsModule,CpdChart,CpdStockChart,CpdTrendChart],templateUrl:'./cpd.html',styleUrls:['./cpd.scss']})
export class CpdPage {
 private http=inject(HttpClient);
 private route=inject(ActivatedRoute);
 private router=inject(Router);
 profiles=signal<Profile[]>([]); stocks=signal<Stock[]>([]); selectedStocks=signal<Stock[]>([]); runs=signal<Run[]>([]);
 latestData=signal<LatestResponse|null>(null); detail=signal<StockDetail|null>(null); selectedStockId=signal<number|null>(null);
 error=signal('');notice=signal('');loading=signal(false);detailLoading=signal(false);saving=signal(false);
 profileId=0;detailOffset=0;editing=false;editingId:number|null=null;latestOffset=0;latestLimit=50;latestSearch='';
 name='';windows='21,63,121';horizons='5,10,21';threshold=.95;stockQuery='';dateFrom='';dateTo='';stockScoreThreshold=.95;appliedStockScoreThreshold=.95;chartWindows=[21,63,121];selectedChartWindows=[21,63,121];appliedChartWindows=[21,63,121];chartFilterError='';

 constructor(){
  this.route.queryParamMap.subscribe(params=>{
   const id=Number(params.get('stock_id'));
   if(Number.isInteger(id)&&id>0){this.selectedStockId.set(id);if(this.profileId)this.loadStock(id)}
   else{this.selectedStockId.set(null);this.detail.set(null)}
  });
  this.loadProfiles();
  this.http.get<{runs:Run[]}>('/api/screeners/cpd/status').subscribe({next:r=>this.runs.set(r.runs),error:()=>{}});
 }

 loadProfiles(select?:number){this.http.get<{items:Profile[]}>('/api/screeners/cpd/configs').subscribe({next:r=>{this.profiles.set(r.items);this.profileId=select||this.profileId||r.items[0]?.id||0;if(this.profileId){this.stockScoreThreshold=this.profiles().find(p=>p.id===this.profileId)?.settings.min_cpd_score??.95;this.appliedStockScoreThreshold=this.stockScoreThreshold;this.loadLatest();const stockId=this.selectedStockId();if(stockId)this.loadStock(stockId)}},error:()=>this.error.set('Unable to load CPD configurations.')})}
 loadLatest(reset=false){if(!this.profileId)return;if(reset)this.latestOffset=0;this.loading.set(true);const params:Record<string,string|number>={config_id:this.profileId,limit:this.latestLimit,offset:this.latestOffset,search:this.latestSearch.trim()};if(this.dateFrom)params['date_from']=this.dateFrom;if(this.dateTo)params['date_to']=this.dateTo;this.http.get<LatestResponse>('/api/screeners/cpd/latest',{params}).subscribe({next:r=>{this.latestData.set(r);this.loading.set(false);this.error.set('')},error:e=>{this.loading.set(false);this.error.set(typeof e.error?.detail==='string'?e.error.detail:'Unable to load CPD signals for the selected dates.')}})}
 loadStock(id:number){if(!this.profileId)return;this.detailLoading.set(true);this.detail.set(null);this.http.get<StockDetail>('/api/screeners/cpd/stocks/'+id,{params:{config_id:this.profileId,limit:25,offset:this.detailOffset}}).subscribe({next:r=>{this.detail.set(r);this.detailLoading.set(false);this.error.set('')},error:e=>{this.detailLoading.set(false);this.error.set(e.status===404?'This stock is not available in the selected configuration.':'Unable to load stock history.')}})}
 profileChanged(){this.latestSearch='';this.latestOffset=0;this.stockScoreThreshold=this.profiles().find(p=>p.id===this.profileId)?.settings.min_cpd_score??.95;this.appliedStockScoreThreshold=this.stockScoreThreshold;this.chartFilterError='';this.loadLatest(true);const id=this.selectedStockId();if(id)this.loadStock(id)}
 toggleChartWindow(window:number){this.selectedChartWindows=this.selectedChartWindows.includes(window)?this.selectedChartWindows.filter(value=>value!==window):[...this.selectedChartWindows,window].sort((a,b)=>a-b);this.chartFilterError=''}
 applyChartFilters(){const raw=String(this.stockScoreThreshold??'').trim();const score=Number(raw);if(!raw||!Number.isFinite(score)||score<0||score>1){this.chartFilterError='Enter a score between 0 and 1.';return}if(!this.selectedChartWindows.length){this.chartFilterError='Select at least one CPD window.';return}this.appliedStockScoreThreshold=score;this.appliedChartWindows=[...this.selectedChartWindows];this.chartFilterError=''}
 selectStock(id:number){this.detailOffset=0;this.router.navigate([],{relativeTo:this.route,queryParams:{stock_id:id},queryParamsHandling:'merge'})}
 tradeStock(symbol:string,stockId:number,signalDate:string|null){this.router.navigate(['/paper-trading'],{queryParams:{source:'cpd',ref:`${stockId}:${signalDate||'latest'}`,symbol}})}
 closeDetail(){this.router.navigate([],{relativeTo:this.route,queryParams:{stock_id:null},queryParamsHandling:'merge'})}
 detailPage(delta:number){this.detailOffset=Math.max(0,this.detailOffset+delta*25);const id=this.selectedStockId();if(id)this.loadStock(id)}
 search(){if(!this.stockQuery.trim()){this.stocks.set([]);return}this.http.get<{items:Stock[]}>('/api/screeners/stocks',{params:{q:this.stockQuery.trim()}}).subscribe({next:r=>this.stocks.set(r.items),error:()=>this.error.set('Stock search is unavailable.')})}
 addStock(s:Stock){if(!this.selectedStocks().some(x=>x.stock_id===s.stock_id))this.selectedStocks.update(x=>[...x,s]);this.stockQuery='';this.stocks.set([])}
 removeStock(id:number){this.selectedStocks.update(x=>x.filter(s=>s.stock_id!==id))}
 create(){this.editing=true;this.editingId=null;this.name='';this.windows='21,63,121';this.horizons='5,10,21';this.threshold=.95;this.selectedStocks.set([])}
 edit(){const p=this.profiles().find(x=>x.id===this.profileId);if(!p||p.is_default)return;this.editing=true;this.editingId=p.id;this.name=p.name;this.windows=p.settings.windows.join(',');this.horizons=p.settings.forward_horizons.join(',');this.threshold=p.settings.min_cpd_score;this.selectedStocks.set(p.selected_stocks)}
 save(){const parse=(s:string)=>s.split(',').map(x=>Number(x.trim()));const body={name:this.name,stock_ids:this.selectedStocks().map(x=>x.stock_id),windows:parse(this.windows),forward_horizons:parse(this.horizons),min_cpd_score:Number(this.threshold)};if(!body.name.trim()||!body.stock_ids.length||[...body.windows,...body.forward_horizons].some(x=>!Number.isInteger(x)||x<=0)||!Number.isFinite(body.min_cpd_score)){this.error.set('Enter a name, at least one stock, and valid numeric settings.');return}this.saving.set(true);const req=this.editingId?this.http.put<{id:number}>('/api/screeners/cpd/configs/'+this.editingId,body):this.http.post<{id:number}>('/api/screeners/cpd/configs',body);req.subscribe({next:r=>{this.saving.set(false);this.editing=false;this.notice.set('Configuration saved.');this.loadProfiles(r.id)},error:e=>{this.saving.set(false);this.error.set(typeof e.error?.detail==='string'?e.error.detail:'Unable to save configuration.')}})}
 latestPage(delta:number){this.latestOffset=Math.max(0,this.latestOffset+delta*this.latestLimit);this.loadLatest()}
 clearDateFilter(){this.dateFrom='';this.dateTo='';this.loadLatest(true)}
 get dateFilterActive(){return !!(this.dateFrom||this.dateTo)}
 historyPage(delta:number){this.detailPage(delta)}
 outcome(row:Result|HistoryEntry,window:number,horizon:string){return row.outcomes?.[String(window)]?.[horizon]}
 horizonKeys(row:Result|HistoryEntry,window:number){return Object.keys(row.outcomes?.[String(window)]||{}).sort((a,b)=>Number(a)-Number(b))}
 get trendPoints(){const rows=this.latestData()?.summary.trend||[];const dates=[...new Set(rows.map(x=>x.signal_date))].sort();const windows=[...new Set(rows.map(x=>String(x.window)))];return dates.map(date=>({date,values:Object.fromEntries(windows.map(w=>[w,rows.find(x=>x.signal_date===date&&String(x.window)===w)?.passed||0]))}))}
 get detailChartPoints(){return this.detail()?.timeline||[]}
 get latestCpdRun(){return this.runs().find(r=>r.job_name==='cpd_daily'||r.job_name==='cpd_backfill')}
 get hasSelectedStock(){return this.selectedStockId()!==null}
 windowSummary(window:number){return this.detail()?.summary.by_window.find(x=>x.window===window)}
 rate(value:number|null){return value===null?'—':(value*100).toFixed(1)+'%'}
 pct(value:number|null){return value===null?'—':value.toFixed(2)+'%'}
 configuredScore(){return this.profiles().find(p=>p.id===this.profileId)?.settings.min_cpd_score??.95}
 displayEnd(total:number,offset:number,pageSize:number){return Math.min(offset+pageSize,total)}
}
