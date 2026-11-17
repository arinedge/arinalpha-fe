import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { interval, Subscription } from 'rxjs';
interface Job { name:string; enabled:boolean; run_time:string; timezone:string; next_run:string|null }
interface Run { id:number; status:string; trigger_type:string; queued_at:string; started_at:string|null; finished_at:string|null; message:string|null; rows_received:number|null; rows_published:number|null }
interface State { jobs:Job[]; worker:{heartbeat_at:string|null}|null; counts:Record<string,number>; global_concurrency:number }
interface Progress { run:{target_date:string;probe_count:number|null}; counts:Record<string,number>; review:{stock_id:number;symbol:string;series:string;next_date:string;last_error:string|null}[] }
@Component({selector:'app-scheduler',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./scheduler.html'})
export class SchedulerPage implements OnDestroy {
 private http=inject(HttpClient); private timer:Subscription; state=signal<State|null>(null); runs=signal<Run[]>([]); progress=signal<Progress|null>(null); error=signal(''); notice=signal(''); busy=signal(false);
 selected=signal(''); enabled=false; runTime='16:15'; editing=false;
 constructor(){this.refresh();this.timer=interval(15000).subscribe(()=>this.refresh())}
 refresh(){this.http.get<State>('/api/admin/schedulers').subscribe({next:s=>{this.state.set(s);this.error.set('');if(!this.selected() && s.jobs.length)this.selected.set(s.jobs[0].name);const j=s.jobs.find(x=>x.name===this.selected());if(j&&!this.editing){this.enabled=j.enabled;this.runTime=j.run_time}if(j)this.loadRuns(j.name)},error:()=>this.error.set('Scheduler status is unavailable. Check backend and database access.')});}
 select(name:string){this.selected.set(name);this.editing=false;this.runs.set([]);this.progress.set(null);this.refresh()}
 label(name:string){return ({bulk_deals_daily:'Bulk Deals daily import',block_deals_daily:'Block Deals daily import',short_selling_daily:'Short Selling daily import',ohlcv_daily:'OHLCV daily import',ohlcv_backfill:'OHLCV historical backfill',cpd_daily:'CPD after OHLCV sync',cpd_backfill:'CPD historical backfill',instrument_master_daily:'Upstox instrument master'} as Record<string,string>)[name] || name}
 loadRuns(name:string){this.http.get<{items:Run[]}>('/api/admin/schedulers/'+name+'/runs').subscribe({next:r=>{if(this.selected()!==name)return;this.runs.set(r.items);if(name.startsWith('ohlcv_')&&r.items.length){this.http.get<Progress>('/api/admin/schedulers/'+name+'/runs/'+r.items[0].id+'/ohlcv').subscribe({next:p=>{if(this.selected()===name)this.progress.set(p)},error:()=>this.progress.set(null)})}},error:()=>this.error.set('Run history is unavailable.')})}
 get lastSuccess(){return this.runs().find(r=>r.status==='succeeded')?.finished_at || null}
 get online(){const t=this.state()?.worker?.heartbeat_at;return !!t && Date.now()-Date.parse(t)<45000}
 save(){const j=this.state()?.jobs.find(x=>x.name===this.selected());if(!j)return;this.busy.set(true);this.http.patch('/api/admin/schedulers/'+j.name,{enabled:this.enabled,run_time:this.runTime}).subscribe({next:()=>{this.busy.set(false);this.editing=false;this.notice.set('Schedule saved.');this.refresh()},error:()=>{this.busy.set(false);this.error.set('Could not save schedule. OHLCV must run after 15:30.')}})}
 run(){const j=this.state()?.jobs.find(x=>x.name===this.selected());if(!j)return;this.busy.set(true);this.http.post('/api/admin/schedulers/'+j.name+'/run',{}).subscribe({next:()=>{this.busy.set(false);this.notice.set('Run queued.');this.refresh()},error:e=>{this.busy.set(false);this.error.set(e.status===409?'This job is already queued or running.':'Could not queue run.')}})}
 ngOnDestroy(){this.timer.unsubscribe()}
}
