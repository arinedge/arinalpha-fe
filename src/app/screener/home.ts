import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({selector:'app-screener-home',standalone:true,imports:[RouterLink],template:`
<div class="page-header"><div class="container-fluid"><h2 class="page-title">Scanners</h2></div></div>
<div class="page-body"><div class="container-fluid"><div class="row row-cards">
 <div class="col-md-6 col-xl-4"><div class="card"><div class="card-body"><div class="subheader">Regime research</div><h3>Change-point detection</h3><p class="text-secondary">Compare daily return changes across configurable windows.</p><a routerLink="/scanners/cpd" class="btn btn-primary">Open CPD</a></div></div></div>
</div></div></div>`})
export class ScreenerHome {}
