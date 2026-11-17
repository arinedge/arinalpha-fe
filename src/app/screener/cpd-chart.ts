import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart,DataZoomComponent,GridComponent,TooltipComponent,LegendComponent,CanvasRenderer]);
type ChartPoint={date:string; scores:Record<string,number>; close?:number|null};
@Component({selector:'app-cpd-chart',standalone:true,template:'<div #plot role="img" aria-label="CPD score and closing price history by window" style="width:100%;height:330px"></div>'})
export class CpdChart implements AfterViewInit,OnChanges,OnDestroy {
 @Input() points:ChartPoint[]=[];
 @Input() threshold=.95;
 @ViewChild('plot',{static:true}) plot!:ElementRef<HTMLDivElement>;
 private chart?:echarts.ECharts;private resize?:ResizeObserver;
 ngAfterViewInit(){this.chart=echarts.init(this.plot.nativeElement);this.resize=new ResizeObserver(()=>this.chart?.resize());this.resize.observe(this.plot.nativeElement);this.draw()}
 ngOnChanges(){this.draw()}
 ngOnDestroy(){this.resize?.disconnect();this.chart?.dispose()}
 private draw(){if(!this.chart)return;const points=[...this.points].sort((a,b)=>a.date.localeCompare(b.date));const windows=[...new Set(points.flatMap(x=>Object.keys(x.scores)))].sort((a,b)=>Number(a)-Number(b));const scores=windows.map((w,i)=>({name:w+' sessions',type:'line' as const,yAxisIndex:0,showSymbol:false,connectNulls:false,lineStyle:{width:1.7},data:points.map(p=>p.scores[w]??null),...(i===0?{markLine:{silent:true,symbol:['none','none'],lineStyle:{color:'#8e96a3',type:'dashed'},label:{formatter:`Gate ${this.threshold.toFixed(2)}`,color:'#6b7280'},data:[{yAxis:this.threshold}]}}:{})}));const price=points.some(p=>p.close!==null&&p.close!==undefined)?[{name:'Close',type:'line' as const,yAxisIndex:1,showSymbol:false,lineStyle:{color:'#9ba4b5',width:1},data:points.map(p=>p.close??null)}]:[];this.chart.setOption({color:['#0204bc','#4d7893','#a28cae','#9ba4b5'],tooltip:{trigger:'axis',axisPointer:{type:'cross'}},legend:{top:0,right:8},grid:{left:48,right:54,top:44,bottom:58},xAxis:{type:'category',data:points.map(x=>x.date),axisLabel:{hideOverlap:true}},yAxis:[{type:'value',min:0,max:1,name:'CPD score',nameLocation:'middle',nameGap:34},{type:'value',name:'Close',nameLocation:'middle',nameGap:42,scale:true,splitLine:{show:false}}],dataZoom:[{type:'inside',start:0,end:100},{type:'slider',height:18,bottom:5}],series:[...scores,...price]},true)}
}
