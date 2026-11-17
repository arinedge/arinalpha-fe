import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart,DataZoomComponent,GridComponent,LegendComponent,TooltipComponent,CanvasRenderer]);
type TrendPoint={date:string;values:Record<string,number>};
@Component({selector:'app-cpd-trend-chart',standalone:true,template:'<div #plot role="img" aria-label="Latest CPD session observations passing configured gates by lookback window"></div>',styles:[':host{display:block;width:100%}div{height:300px;width:100%}']})
export class CpdTrendChart implements AfterViewInit,OnChanges,OnDestroy {
 @Input() points:TrendPoint[]=[];
 @Input() compact=false;
 @ViewChild('plot',{static:true}) plot!:ElementRef<HTMLDivElement>;
 private chart?:echarts.ECharts;private resize?:ResizeObserver;
 ngAfterViewInit(){this.chart=echarts.init(this.plot.nativeElement);this.resize=new ResizeObserver(()=>this.chart?.resize());this.resize.observe(this.plot.nativeElement);this.draw()}
 ngOnChanges(){this.draw()}
 ngOnDestroy(){this.resize?.disconnect();this.chart?.dispose()}
 private draw(){if(!this.chart)return;const points=[...this.points].sort((a,b)=>a.date.localeCompare(b.date));const windows=[...new Set(points.flatMap(x=>Object.keys(x.values)))].sort((a,b)=>Number(a)-Number(b));const colors=['#0204bc','#4d8790','#b0803c'];if(this.compact||points.length<=1){this.chart.setOption({color:colors,tooltip:{trigger:'axis',valueFormatter:(v:number)=>`${v} passing observations`},legend:{show:false},grid:{left:58,right:20,top:24,bottom:44},xAxis:{type:'category',data:windows.map(w=>`${w} sessions`),axisTick:{alignWithLabel:true},axisLabel:{color:'#687587'}},yAxis:{type:'value',minInterval:1,name:'Gate passes',nameLocation:'middle',nameGap:38},series:[{name:'Passing observations',type:'bar',barMaxWidth:52,data:windows.map((w,i)=>({value:points[0]?.values[w]??0,itemStyle:{color:colors[i%colors.length],borderRadius:[4,4,0,0]}}))}]},true);return}this.chart.setOption({color:colors,tooltip:{trigger:'axis',valueFormatter:(v:number)=>`${v} window observations`},legend:{top:0,right:8},grid:{left:45,right:18,top:42,bottom:56},xAxis:{type:'category',data:points.map(x=>x.date),axisLabel:{hideOverlap:true}},yAxis:{type:'value',minInterval:1,name:'Gate passes',nameLocation:'middle',nameGap:32},dataZoom:[{type:'inside',start:0,end:100},{type:'slider',height:18,bottom:5}],series:windows.map(w=>({name:`${w} sessions`,type:'bar',barMaxWidth:14,data:points.map(p=>p.values[w]??0)}))},true)}
}
