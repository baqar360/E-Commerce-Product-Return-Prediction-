const $=s=>document.querySelector(s),pct=v=>(v*100).toFixed(1)+'%',f3=v=>(+v).toFixed(3),nice=s=>s.replace(/_/g,' ');
async function api(p,o){const r=await fetch('/api'+p,o);if(!r.ok){let m=r.statusText;try{const j=await r.json();m=typeof j.detail==='string'?j.detail:j.detail.map(d=>d.loc.slice(-1)+': '+d.msg).join('; ')}catch{}throw new Error(m)}return r.json()}
Chart.defaults.font.family='"Segoe UI",system-ui,sans-serif';Chart.defaults.color='#5d727b';
const charts={};function chart(id,cfg){charts[id]&&charts[id].destroy();charts[id]=new Chart($('#'+id),cfg)}
const C={blue:'#0e6e8c',teal:'#5fb3b3',red:'#c8452f',amber:'#d89a1d',green:'#2f8f5b',gray:'#b7c4c9'};
const hbar=(labels,sets,min)=>({type:'bar',data:{labels,datasets:sets},options:{indexAxis:'y',scales:{x:{min}},plugins:{legend:{display:sets.length>1}}}});

let CFG;const done={};
const pages={predict:initPredict,compare:initCompare,detail:initDetail,explain:initExplain,insights:initInsights,workflow:initWorkflow};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.p));
async function show(p){
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  document.querySelectorAll('main section').forEach(s=>s.hidden=s.id!==p);location.hash=p;
  if(done[p])return;done[p]=1;
  try{CFG=CFG||await api('/config');await pages[p]()}catch(e){done[p]=0;$('#'+p).insertAdjacentHTML('beforeend',`<p class="err">Could not load this page: ${e.message}. Check that the API is running.</p>`)}
}

/* ---- Predict ---- */
const NUMS=[['customer_age','Customer age',30,1,10,100],['product_price','Product price',120,'any',.01,10000],['discount_percent','Discount (%)',20,'any',0,100],['product_rating','Product rating (0-5)',4,'any',0,5],['past_purchase_count','Past purchases',5,1,0,500],['past_return_rate','Past return rate (0-1)',.2,'any',0,1],['delivery_delay_days','Delivery delay (days)',0,'any',-30,90],['session_length_minutes','Session length (min)',25,'any',0,1440],['num_product_views','Product views',5,1,0,1000]];
const HIGH={customer_age:30,product_price:120,discount_percent:55,product_rating:3.2,past_purchase_count:2,past_return_rate:.5,delivery_delay_days:0,session_length_minutes:20,num_product_views:3,used_coupon:1,device_type:'desktop',product_category:'clothing',shipping_method:'express',payment_method:'apple_pay'};
const LOW={customer_age:40,product_price:15,discount_percent:10,product_rating:4.5,past_purchase_count:15,past_return_rate:.1,delivery_delay_days:0,session_length_minutes:110,num_product_views:25,used_coupon:0,device_type:'mobile',product_category:'electronics',shipping_method:'same_day',payment_method:'debit_card'};
function initPredict(){
  const sel=(n,l,opts)=>`<label>${l}<select name="${n}">${opts.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>`;
  const o=CFG.options,cat=k=>o[k].map(v=>[v,nice(v)]);
  $('#f').innerHTML=NUMS.map(n=>`<label>${n[1]}<input type="number" name="${n[0]}" value="${n[2]}" step="${n[3]}" min="${n[4]}" max="${n[5]}" required></label>`).join('')
   +sel('used_coupon','Used a coupon',[[0,'No'],[1,'Yes']])+sel('device_type','Device',cat('device_type'))+sel('product_category','Product category',cat('product_category'))
   +sel('shipping_method','Shipping method',cat('shipping_method'))+sel('payment_method','Payment method',cat('payment_method'))
   +`<label class="full">Model<select name="model_id">${CFG.models.map(m=>`<option value="${m.id}"${m.id===CFG.final_model.id?' selected':''}>${m.name}${m.id===CFG.final_model.id?' (final)':''}</option>`).join('')}</select></label>`
   +`<div class="full"><button class="go" type="submit">Predict</button> <button class="alt" type="button" id="eh">Fill a risky order</button> <button class="alt" type="button" id="el">Fill a safe order</button></div>`;
  const fill=d=>Object.entries(d).forEach(([k,v])=>$('#f [name='+k+']').value=v);
  $('#eh').onclick=()=>fill(HIGH);$('#el').onclick=()=>fill(LOW);
  $('#f').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
    ['used_coupon','past_purchase_count','num_product_views'].forEach(k=>d[k]=parseInt(d[k]));
    NUMS.forEach(n=>d[n[0]]=Number(d[n[0]]));
    try{showResult(await api('/predict',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}),d.model_id)}
    catch(err){$('#out').innerHTML=`<p class="err">${err.message}</p>`}};
}
function gauge(p,z){
  const cx=110,cy=110,r=90,pt=(q,rr)=>{const a=Math.PI*(1-q);return[cx+rr*Math.cos(a),cy-rr*Math.sin(a)]};
  const arc=(a,b,c)=>{const[x0,y0]=pt(a,r),[x1,y1]=pt(b,r);return`<path d="M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}" stroke="${c}" stroke-width="16" fill="none"/>`};
  const zones=z?arc(0,z[0],'var(--low)')+arc(z[0],z[1],'var(--med)')+arc(z[1],1,'var(--high)'):arc(0,1,'var(--line)');
  const[nx,ny]=pt(p,r-24);
  return`<svg viewBox="0 0 220 125" width="260">${zones}<line x1="110" y1="110" x2="${nx}" y2="${ny}" stroke="#14303a" stroke-width="3" stroke-linecap="round"/><circle cx="110" cy="110" r="6" fill="#14303a"/></svg>`;
}
function showResult(r,mid){
  const col={Low:'var(--low)',Medium:'var(--med)',High:'var(--high)'}[r.risk_level],c=CFG.risk_cutoffs;
  const z=mid===CFG.final_model.id?[c.low_max,c.medium_max]:null,mx=Math.max(...r.top_factors.map(f=>Math.abs(f.effect)),1e-9);
  const fac=r.top_factors.length?r.top_factors.map(f=>`<div class="fac"><span>${nice(f.feature)}</span><div><div class="bar" style="width:${Math.abs(f.effect)/mx*100}%;background:${f.effect>0?'var(--high)':'var(--low)'}"></div></div><span>${f.effect>0?'raises risk':'lowers risk'}</span></div>`).join(''):'<p class="muted">Reasons are shown for XGBoost models.</p>';
  $('#out').innerHTML=`<div class="res">${gauge(r.return_probability,z)}<p class="big">${pct(r.return_probability)}</p><p class="muted">chance this order is returned</p>
  <span class="badge" style="background:${col}">${r.risk_level} risk</span> <b>${r.label}</b>
  <p class="muted">Model: ${r.model}. Predicted as returned when the chance is at least ${pct(r.threshold_used)}.</p></div><h3>Main reasons</h3>${fac}`;
}

/* ---- Compare ---- */
async function initCompare(){
  const M=(await api('/models')).sort((a,b)=>b.test.roc_auc-a.test.roc_auc),L=M.map(m=>m.name);
  $('#tbl').innerHTML='<tr><th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>ROC-AUC</th><th>Train AUC</th><th>CV AUC</th><th>Fit time (s)</th></tr>'
   +M.map(m=>`<tr class="${m.is_final?'final':''}"><td>${m.name}${m.is_final?'<span class="tag">final</span>':''}</td><td>${f3(m.test.accuracy)}</td><td>${f3(m.test.precision)}</td><td>${f3(m.test.recall)}</td><td>${f3(m.test.f1)}</td><td>${f3(m.test.roc_auc)}</td><td>${f3(m.train.roc_auc)}</td><td>${f3(m.cv_roc_auc)}</td><td>${m.fit_time_sec}</td></tr>`).join('');
  chart('c1',hbar(L,[{label:'Train',data:M.map(m=>m.train.roc_auc),backgroundColor:C.gray},{label:'Test',data:M.map(m=>m.test.roc_auc),backgroundColor:C.blue}],.45));
  chart('c2',hbar(L,[['accuracy','Accuracy',C.blue],['precision','Precision',C.teal],['recall','Recall',C.amber],['f1','F1',C.green]].map(k=>({label:k[1],data:M.map(m=>m.test[k[0]]),backgroundColor:k[2]})),.3));
}

/* ---- Model details ---- */
async function initDetail(){
  $('#dm').innerHTML=CFG.models.map(m=>`<option value="${m.id}"${m.id===CFG.final_model.id?' selected':''}>${m.name}</option>`).join('');
  $('#dm').onchange=loadDetail;await loadDetail();
}
async function loadDetail(){
  const d=await api('/models/'+$('#dm').value),t=d.test,cv=d.curves;
  $('#cards').innerHTML=[['Accuracy',t.accuracy],['Precision',t.precision],['Recall',t.recall],['F1',t.f1],['ROC-AUC',t.roc_auc]].map(x=>`<div class="card"><b>${f3(x[1])}</b><span>${x[0]}</span></div>`).join('');
  chart('c3',{type:'line',data:{labels:cv.fpr.map(v=>v.toFixed(2)),datasets:[{label:'This model',data:cv.tpr,borderColor:C.blue,pointRadius:0,borderWidth:2.5},{label:'Random guess',data:cv.fpr,borderColor:C.gray,borderDash:[5,4],pointRadius:0}]},options:{scales:{x:{title:{display:true,text:'False positive rate'},ticks:{maxTicksLimit:6}},y:{title:{display:true,text:'True positive rate'}}}}});
  const[[tn,fp],[fn,tp]]=cv.confusion_matrix;
  $('#cm').innerHTML=`<table><tr><th></th><th>Predicted: not returned</th><th>Predicted: returned</th></tr><tr><th>Actual: not returned</th><td>${tn}</td><td>${fp}</td></tr><tr><th>Actual: returned</th><td>${fn}</td><td>${tp}</td></tr></table><p class="muted">Cutoff used: ${f3(cv.cm_threshold)}</p>`;
  $('#params').innerHTML=Object.entries(d.params||{}).map(([k,v])=>`<dt>${k}</dt><dd>${typeof v==='number'?+v.toFixed(4):v}</dd>`).join('')||'<dd>Default settings</dd>';
}

/* ---- Explain ---- */
async function initExplain(){
  const I=await api('/importance'),top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,15);
  const p=top(Object.fromEntries(Object.entries(I.permutation).map(([k,v])=>[k,v.importance])));
  chart('c4',hbar(p.map(x=>nice(x[0])),[{data:p.map(x=>x[1]),backgroundColor:C.blue}]));
  if(I.shap_mean_abs){const s=top(I.shap_mean_abs);chart('c5',hbar(s.map(x=>nice(x[0])),[{data:s.map(x=>x[1]),backgroundColor:C.teal}]))}
  else{$('#c5').hidden=true;$('#noshap').hidden=false}
}

/* ---- Insights ---- */
async function initInsights(){
  const S=await api('/data-summary'),ts=S.target_share,keys=Object.keys(S.return_rate_by);
  $('#stats').innerHTML=[['Orders',S.rows.toLocaleString()],['Columns',S.columns],['Model features',S.final_feature_count],['Return rate',pct(ts['1'])]].map(x=>`<div class="card"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
  chart('c6',{type:'doughnut',data:{labels:['Not returned','Returned'],datasets:[{data:[ts['0'],ts['1']],backgroundColor:[C.gray,C.blue]}]}});
  $('#rf').innerHTML=keys.map(k=>`<option value="${k}">${nice(k)}</option>`).join('');
  const draw=()=>{const r=S.return_rate_by[$('#rf').value],l=Object.keys(r);
    chart('c7',{data:{labels:l.map(x=>x==='0'?'No':x==='1'?'Yes':nice(x)),datasets:[{type:'bar',label:'Return rate',data:l.map(x=>r[x]),backgroundColor:C.blue},{type:'line',label:'Overall',data:l.map(()=>ts['1']),borderColor:C.red,borderDash:[5,4],pointRadius:0}]},options:{scales:{y:{min:.3,max:.65}}}})};
  $('#rf').onchange=draw;draw();
  const cr=Object.entries(S.correlation_with_target).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  chart('c8',hbar(cr.map(x=>nice(x[0])),[{data:cr.map(x=>x[1]),backgroundColor:cr.map(x=>x[1]>0?C.red:C.green)}]));
  $('#bad').innerHTML='<table>'+Object.entries(S.impossible_values).map(([k,v])=>`<tr><td>${k}</td><td>${v.toLocaleString()} rows (${pct(v/S.rows)})</td></tr>`).join('')+'</table><p class="muted">These were set to missing and filled with the median before training.</p>';
}

/* ---- Workflow ---- */
function initWorkflow(){
  const D=['About 200,000 orders with 16 columns and no missing values.','Impossible values (negative price or views, rating above 5) set to missing; order_id removed.','New features such as price after discount, late delivery, views per minute and age group.','80% train and 20% test, with the same return ratio in both.','Median fill, scaling and one-hot encoding, learned from the training data only.','Logistic Regression compared with random guessing (ROC-AUC 0.50).','Seven models compared with 5-fold cross-validation.','Randomized search on the two best models.',`Final model: ${CFG.final_model.name}, chosen by cross-validation. Cutoff ${CFG.threshold.toFixed(2)} tuned on training predictions.`,'Permutation importance and SHAP show which features matter most.'];
  const T=['Raw data','Cleaning','Feature engineering','Train/test split','Preprocessing pipeline','Baseline','Model comparison','Hyperparameter tuning','Final model and threshold','Explainability'];
  $('#steps').innerHTML=T.map((t,i)=>`<li data-n="${i+1}"><b>${t}</b><span>${D[i]}</span></li>`).join('');
}
show(location.hash.slice(1) in pages?location.hash.slice(1):'predict');
