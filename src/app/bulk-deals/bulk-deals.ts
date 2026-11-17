import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, shareReplay } from 'rxjs';
import { scaleLinear, line } from 'd3';
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);
echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
type Value = number | string;
interface Group { name: string; records: number; value: Value; client_id?:number; buy_value?:Value; sell_value?:Value }
interface Summary { records: number; symbols: number; clients: number; buy_value: Value; sell_value: Value; first_date?: string; last_date?: string; active_dates?:number }
interface Deal { id:number; client_id:number; trade_date:string; symbol:string; stock_name:string; client_name:string; transaction_type:string; quantity:number; price:Value; value_rupees:Value; remarks:string }
interface Trend { trade_date:string; buy_value:Value; sell_value:Value }
interface Overview { latest_date:string|null; selected_date:string|null; summary:Summary; top_clients:Group[]; top_stocks:Group[]; trends:Trend[]; coverage_note:string }
interface Result { total:number; items:Deal[] }
interface Detail { client_id?:number; name?:string; symbol?:string; summary:Summary; top_stocks?:Group[]; top_clients?:Group[]; trends:Trend[]; two_sided_groups:number; identity_note:string }
interface Pattern { symbol:string; clients:number; returning_clients:number; records:number; baseline_days:number; gross_value:Value; buy_value:Value; sell_value:Value; baseline_avg:Value|null; relative_activity:Value|null; unusual:boolean }
interface Patterns { date:string; baseline_days:number; items:Pattern[]; method:string }

@Component({selector:'app-bulk-deals',standalone:true,imports:[CommonModule,FormsModule,RouterLink],templateUrl:'./bulk-deals.html'})
export class BulkDealsPage implements OnDestroy {
 private http=inject(HttpClient); private route=inject(ActivatedRoute);
 private latest=this.http.get<Result>('/api/bulk-deals',{params:new HttpParams().set('limit',1)}).pipe(shareReplay({bufferSize:1,refCount:false}));
 @ViewChild('ranking') ranking?:ElementRef<HTMLDivElement>;
 @ViewChild('mix') mix?:ElementRef<HTMLCanvasElement>;
 asOf=signal<string|null>(null); overview=signal<Overview|null>(null); result=signal<Result|null>(null); detail=signal<Detail|null>(null); patterns=signal<Patterns|null>(null);
 loading=signal(true); error=signal(''); date=''; symbol=''; client=''; side=''; sortBy='date'; direction='desc'; offset=0; readonly limit=50;
 kind=this.route.snapshot.data['kind'] as string|undefined; name=this.route.snapshot.queryParamMap.get('name') || ''; clientId=this.route.snapshot.queryParamMap.get('id') || '';
 private initial=true; private requestVersion=0; private bar?:echarts.ECharts; private donut?:Chart; private resize=()=>this.bar?.resize();
 constructor(){window.addEventListener('resize',this.resize);this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params=>{const name=params.get('name')||'';const id=params.get('id')||'';if(this.kind && (name!==this.name || id!==this.clientId)){this.detail.set(null);this.result.set(null)}this.name=name;this.clientId=id;this.offset=0;this.load()});}
 load(){const version=++this.requestVersion;this.loading.set(true);this.error.set('');let p=new HttpParams().set('limit',this.limit).set('offset',this.offset).set('sort_by',this.sortBy).set('direction',this.direction);
  if(this.date)p=p.set('start',this.date).set('end',this.date); if(this.symbol)p=p.set('symbol',this.symbol);if(this.client)p=p.set('client',this.client);if(this.side)p=p.set('side',this.side);
  if(this.kind){const byId=this.kind==='client' && !!this.clientId;const key=byId?'client_id':this.kind==='client'?'name':'symbol';const value=byId?this.clientId:this.name;const detail=this.http.get<Detail>('/api/bulk-deals/'+this.kind,{params:new HttpParams().set(key,value)});const list=this.http.get<Result>('/api/bulk-deals',{params:p.set(byId?'client_id':this.kind==='client'?'client_exact':'symbol_exact',value)});forkJoin({detail,list,latest:this.latest}).subscribe({next:x=>{if(version!==this.requestVersion)return;this.asOf.set(x.latest.items[0]?.trade_date || null);this.detail.set(x.detail);this.result.set(x.list);this.loading.set(false);setTimeout(()=>{if(version===this.requestVersion)this.renderCharts()},0)},error:()=>this.fail(version)});}
  else {let q=new HttpParams();if(this.date)q=q.set('day',this.date);if(this.symbol)q=q.set('symbol',this.symbol);if(this.client)q=q.set('client',this.client);if(this.side)q=q.set('side',this.side);forkJoin({overview:this.http.get<Overview>('/api/bulk-deals/overview',{params:q}),patterns:this.http.get<Patterns>('/api/bulk-deals/patterns',{params:q}),list:this.http.get<Result>('/api/bulk-deals',{params:p})}).subscribe({next:x=>{if(version!==this.requestVersion)return;if(this.initial && !this.date && x.overview.latest_date){this.initial=false;this.date=x.overview.latest_date;this.load();return}this.initial=false;this.asOf.set(x.overview.latest_date);this.overview.set(x.overview);this.patterns.set(x.patterns);this.result.set(x.list);this.loading.set(false);setTimeout(()=>{if(version===this.requestVersion)this.renderCharts()},0)},error:()=>this.fail(version)});}}
 fail(version:number){if(version!==this.requestVersion)return;this.loading.set(false);this.error.set('Bulk-deal data is unavailable. Check the backend connection and try again.');}
 apply(){this.offset=0;this.load()}
 page(delta:number){this.offset=Math.max(0,this.offset+delta*this.limit);this.load()}
 calendarDate(value:string){return new Date(value+'T00:00:00Z')}
 crore(v:Value|null|undefined){return Number(v||0)/10000000}
 trendPath(side:'buy'|'sell'){const t=this.overview()?.trends||this.detail()?.trends||[];if(t.length<2)return '';const values=t.map(v=>Number(side==='buy'?v.buy_value:v.sell_value)/10000000);const all=t.flatMap(v=>[Number(v.buy_value)/10000000,Number(v.sell_value)/10000000]);const x=scaleLinear().domain([0,t.length-1]).range([0,600]);const y=scaleLinear().domain([0,Math.max(...all,1)]).range([120,5]);return line<number>().x((_,i)=>x(i)).y(v=>y(v))(values)||''}
 private renderCharts(){this.bar?.dispose();this.donut?.destroy();const o=this.overview(),d=this.detail();const groups=o?.top_clients||d?.top_stocks||d?.top_clients||[];if(this.ranking&&groups.length){this.bar=echarts.init(this.ranking.nativeElement);this.bar.setOption({grid:{left:145,right:20,top:10,bottom:30},tooltip:{trigger:'axis',valueFormatter:(value:unknown)=>'₹ '+Number(value).toFixed(2)+' Cr'},xAxis:{type:'value',name:'₹ Cr',axisLabel:{formatter:(value:number)=>value.toFixed(2)}},yAxis:{type:'category',data:groups.slice(0,8).map(x=>x.name.length>22?x.name.slice(0,21)+'…':x.name).reverse()},series:[{type:'bar',barMaxWidth:16,data:groups.slice(0,8).map(x=>this.crore(x.value)).reverse(),itemStyle:{color:'#0204bc'}}]});}const sum=o?.summary||d?.summary;if(this.mix&&sum){this.donut=new Chart(this.mix.nativeElement,{type:'doughnut',data:{labels:['Buy','Sell'],datasets:[{data:[this.crore(sum.buy_value),this.crore(sum.sell_value)],backgroundColor:['#0204bc','#e56c81']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:(item)=>item.label+': ₹'+Number(item.raw).toFixed(2)+' Cr'}}}}})}}
 ngOnDestroy(){this.requestVersion++;window.removeEventListener('resize',this.resize);this.bar?.dispose();this.donut?.destroy()}
}
