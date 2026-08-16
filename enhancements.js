(function(){
  const backupKey=`${KEY}-auto-backup`;
  const baseEnsureData=ensureData;
  const baseRenderTracker=renderTracker;
  const baseRender=render;
  const muscleOrder=['胸','背','肩','三头','二头','腿','臀','腹','小腿','其他'];
  let sessionStartedAt=null,readinessModeRestored=false;

  ensureData=function(){
    baseEnsureData();
    data.readiness??=[];
    data.templates??=[];
    data.upgradeVersion=Math.max(1,data.upgradeVersion||0);
  };
  ensureData();

  function meaningfulData(){return data.records.length||data.checkins.length||data.body.length||data.wearable.length||data.templates.length}
  function autoBackup(){
    const old=localStorage.getItem(backupKey);
    if(!meaningfulData()&&old)return;
    localStorage.setItem(backupKey,JSON.stringify({at:new Date().toISOString(),data}));
    renderBackupStatus();
  }
  function saveUpgrades(){save();autoBackup()}
  function downloadFile(name,content,type){
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function injectUpgradeUI(){
    if(!$('readinessPanel')){
      const panel=document.createElement('section');panel.id='readinessPanel';panel.className='card panel readiness-panel';
      panel.innerHTML=`<div class="upgrade-head"><div><p class="eyebrow">READINESS</p><h2>练前状态 · 自动建议训练量</h2></div><span class="soft-tag">只建议，不锁死</span></div><div class="readiness-grid"><label>昨晚睡眠<input id="readinessSleep" type="number" min="0" max="12" step="0.5" value="7"><small>小时</small></label><label>今天精力<select id="readinessEnergy"><option value="1">1 很差</option><option value="2">2 偏低</option><option value="3" selected>3 一般</option><option value="4">4 良好</option><option value="5">5 很好</option></select></label><label>肌肉酸痛<select id="readinessSoreness"><option value="0">0 无</option><option value="1">1 很轻</option><option value="2" selected>2 正常</option><option value="3">3 明显</option><option value="4">4 很重</option><option value="5">5 严重</option></select></label><label>关节或其他不适<select id="readinessPain"><option value="none">没有</option><option value="mild">轻微，可无痛活动</option><option value="clear">明显或动作会痛</option></select></label><label>可训练时间<select id="readinessMinutes"><option value="35">约35分钟</option><option value="50">约50分钟</option><option value="70" selected>约70分钟</option><option value="90">90分钟以上</option></select></label><button id="applyReadiness" class="secondary" type="button">评估并应用建议</button></div><div id="readinessAdvice" class="readiness-advice">填好今天状态，系统会建议快速、标准或加强模式；你仍可手动更改。</div>`;
      document.querySelector('.today-workout').before(panel);
    }
    if(!$('weeklyAnalytics')){
      const panel=document.createElement('section');panel.id='weeklyAnalytics';panel.className='card panel analytics-panel';
      panel.innerHTML=`<div class="upgrade-head"><div><p class="eyebrow">LOAD & RECOVERY</p><h2>本周训练负荷与恢复提醒</h2></div><span class="soft-tag">最近7天</span></div><div class="analytics-stats"><div><span>有效正式组</span><strong id="weeklyWorkSets">0</strong><small>组</small></div><div><span>训练容量</span><strong id="weeklyVolume">0</strong><small>kg</small></div><div><span>最高估算1RM</span><strong id="weeklyE1rm">0</strong><small>kg</small></div></div><div id="weeklyMuscle" class="muscle-bars"></div><div id="deloadAdvice" class="deload-advice"></div>`;
      document.querySelector('.progress-panel').after(panel);
    }
    if(!$('upgradeDataTools')){
      const panel=document.createElement('section');panel.id='upgradeDataTools';panel.className='card panel data-tools';
      panel.innerHTML=`<div class="upgrade-head"><div><p class="eyebrow">DATA</p><h2>自动备份与训练表格</h2></div><span class="soft-tag">当前设备</span></div><p class="guide">每次操作后自动保存一份本机快照。JSON 用于完整迁移，CSV 可用表格软件查看训练明细。</p><div class="backup-actions"><button id="exportCsv" type="button">导出训练 CSV</button><button id="restoreAutoBackup" class="secondary" type="button">恢复自动备份</button></div><p id="backupStatus" class="backup-status"></p><p class="cloud-note">跨手机实时同步需要后续接入国内云数据库；当前版本先保证免费、本机可恢复和手动迁移。</p>`;
      document.querySelector('.body-backup').after(panel);
    }
    if(!$('workoutSummary')){
      const modal=document.createElement('div');modal.id='workoutSummary';modal.className='summary-overlay';modal.hidden=true;
      modal.innerHTML=`<section class="summary-card" role="dialog" aria-modal="true" aria-labelledby="summaryTitle"><p class="eyebrow">WORKOUT COMPLETE</p><h2 id="summaryTitle">本次训练已保存</h2><div id="summaryStats" class="summary-stats"></div><p id="summaryPrs" class="summary-prs"></p><p id="summaryReadiness" class="guide"></p><div class="summary-actions"><button id="copySummary" type="button">复制训练战报</button><button id="closeSummary" class="secondary" type="button">完成</button></div></section>`;
      document.body.append(modal);
    }
    const metric=$('progressMetric');
    if(metric&&!metric.querySelector('[value="e1rm"]'))metric.insertAdjacentHTML('beforeend','<option value="e1rm">估算1RM</option>');
    bindUpgradeUI();
  }

  function latestReadiness(){return data.readiness.findLast(x=>x.date===dateKey())||null}
  function readinessResult(values){
    let score=55;
    score+=values.sleep>=7.5?15:values.sleep>=6.5?8:values.sleep>=5.5?0:-15;
    score+=(values.energy-3)*9;
    score-=values.soreness*5;
    score-=values.pain==='clear'?28:values.pain==='mild'?10:0;
    score=Math.max(0,Math.min(100,Math.round(score)));
    let mode='standard';
    if(values.minutes<=40||score<55||values.pain==='clear')mode='quick';
    else if(values.minutes>=90&&score>=78)mode='enhanced';
    const reasons=[];
    if(values.sleep<6.5)reasons.push('睡眠偏少');
    if(values.energy<=2)reasons.push('精力偏低');
    if(values.soreness>=4)reasons.push('酸痛较重');
    if(values.pain==='clear')reasons.push('存在明显不适');
    if(values.minutes<=40)reasons.push('时间有限');
    if(!reasons.length)reasons.push(score>=78?'恢复状态良好':'状态适合正常训练');
    return{score,mode,reasons};
  }
  function readinessValues(){return{sleep:+$('readinessSleep').value||0,energy:+$('readinessEnergy').value||3,soreness:+$('readinessSoreness').value||0,pain:$('readinessPain').value,minutes:+$('readinessMinutes').value||70}}
  function readinessText(item){
    if(!item)return '填好今天状态，系统会建议快速、标准或加强模式；你仍可手动更改。';
    const warning=item.pain==='clear'?' 明显疼痛部位不要硬练：避开引发疼痛的动作，必要时选择恢复训练并及时就医。':'';
    return `状态分 ${item.score}/100｜建议${volumeLabels[item.mode]}模式｜依据：${item.reasons.join('、')}。${warning}`;
  }
  function applyReadiness(){
    const values=readinessValues(),result=readinessResult(values),item={date:dateKey(),at:new Date().toISOString(),...values,...result};
    const i=data.readiness.findIndex(x=>x.date===item.date);if(i>=0)data.readiness[i]=item;else data.readiness.push(item);
    sessionVolume=item.mode;
    if($('sessionVolumeChoice'))$('sessionVolumeChoice').value=sessionVolume;
    saveUpgrades();renderTracker();$('readinessAdvice').textContent=readinessText(item);
    toast(`已建议${volumeLabels[item.mode]}模式｜状态分 ${item.score}`);
  }
  function restoreReadinessInputs(){
    const item=latestReadiness();if(!item)return;
    $('readinessSleep').value=item.sleep;$('readinessEnergy').value=item.energy;$('readinessSoreness').value=item.soreness;$('readinessPain').value=item.pain;$('readinessMinutes').value=item.minutes;$('readinessAdvice').textContent=readinessText(item);
  }

  function setBoxUpgrade(box,index,values={}){
    const label=box.querySelector('label');if(label)label.lastChild.textContent=`第${index+1}组`;
    if(box.querySelector('.set-type'))return;
    const type=document.createElement('select');type.className='set-type';type.title='组类型';type.innerHTML='<option value="work">正式组</option><option value="warmup">热身组</option><option value="drop">递减组</option><option value="failure">力竭组</option>';type.value=values.setType||'work';
    const rir=document.createElement('select');rir.className='rir';rir.title='余力次数 RIR（对应主观强度 RPE）';rir.innerHTML='<option value="">RIR / RPE</option>'+[0,1,2,3,4,5].map(x=>`<option value="${x}">RIR ${x} / RPE ${10-x}</option>`).join('');rir.value=values.rir??2;
    const remove=document.createElement('button');remove.className='remove-set';remove.type='button';remove.title='删除本组';remove.textContent='×';
    box.append(type,rir,remove);
  }
  function renumberCards(){
    document.querySelectorAll('#setTracker .exercise-track').forEach((card,i)=>{const h=card.querySelector('h3');if(h&&h.firstChild)h.firstChild.nodeValue=`${i+1}. `;[...card.querySelectorAll('.set-box')].forEach((box,j)=>{const l=box.querySelector('label');if(l)l.lastChild.textContent=`第${j+1}组`});card.dataset.groups=card.querySelectorAll('.set-box').length});
  }
  function trackerToolbar(){
    const names=[...new Set(plans.flatMap(p=>p.library||p.ex).flatMap(x=>[x[0],...(x[3]||[])]).filter(x=>!String(x).includes('跳过')))];
    const templates=data.templates.map((x,i)=>`<option value="${i}">${esc(x.name)}</option>`).join('');
    return `<div id="trackerTools" class="tracker-tools"><div><input id="exerciseSearch" list="exerciseLibrary" placeholder="搜索或输入动作名称"><datalist id="exerciseLibrary">${names.map(x=>`<option value="${esc(x)}">`).join('')}</datalist><button id="addExercise" type="button">＋添加动作</button></div><div><select id="templateChoice"><option value="">选择已保存模板</option>${templates}</select><button id="loadTemplate" class="secondary" type="button">加载</button><button id="saveTemplate" class="secondary" type="button">保存当前结构</button><button id="deleteTemplate" class="text-button" type="button">删除模板</button></div></div>`;
  }
  function buildExerciseCard(name,groups=3,reps='8–12',superset=false){
    const card=document.createElement('div');card.className='exercise-track';card.dataset.name=name;card.dataset.groups=groups;card.dataset.reps=reps;
    card.innerHTML=`<h3>0. <span class="exercise-name">${esc(name)}</span></h3><span class="last-time">${esc(historyHint(name,groups,reps))}</span><span class="progression-tip">${esc(progressionTip(name,groups,reps))}</span><div class="exercise-actions"><label>现场动作<select class="alt-select"><option value="${esc(name)}">${esc(name)}</option><option value="__custom">修改动作名称…</option></select></label><label class="skip-label"><input class="skip-exercise" type="checkbox">跳过这个动作</label></div><p class="alternative-note">自定义动作：请先用轻重量试做，确认无痛且轨迹稳定。</p><div class="exercise-guide">${guideHtml(name)}</div><div class="sets">${Array.from({length:groups},(_,i)=>`<div class="set-box"><label><input class="set-check" type="checkbox">第${i+1}组</label><input class="kg" type="number" step="0.5" min="0" placeholder="重量kg"><input class="reps" type="number" min="0" placeholder="次数"></div>`).join('')}</div>`;
    if(superset)card.dataset.superset='true';
    return card;
  }
  function enhanceTracker(){
    const tracker=$('setTracker');if(!tracker)return;
    tracker.querySelectorAll('.exercise-track').forEach(card=>{
      [...card.querySelectorAll('.set-box')].forEach((box,i)=>setBoxUpgrade(box,i));
      if(!card.querySelector('.exercise-manage')){
        const manage=document.createElement('div');manage.className='exercise-manage';manage.innerHTML=`<button class="move-up" type="button" title="上移动作">↑</button><button class="move-down" type="button" title="下移动作">↓</button><label><input class="superset-next" type="checkbox" ${card.dataset.superset==='true'?'checked':''}>与下一动作超级组</label><button class="remove-exercise text-button" type="button">删除动作</button>`;
        card.querySelector('h3').after(manage);
        const add=document.createElement('button');add.className='add-set secondary';add.type='button';add.textContent='＋增加一组';card.append(add);
      }
    });
    if(!$('trackerTools'))tracker.insertAdjacentHTML('beforeend',trackerToolbar());
    bindTrackerControls();renumberCards();
  }
  function bindTrackerControls(){
    document.querySelectorAll('#setTracker .alt-select').forEach(x=>x.onchange=()=>{const card=x.closest('.exercise-track');let name=x.value;if(name==='__custom')name=prompt('输入你现场实际使用的动作名称：')?.trim()||card.dataset.name;card.dataset.name=name;card.querySelector('.exercise-name').textContent=name;card.querySelector('.last-time').textContent=historyHint(name,+card.dataset.groups,card.dataset.reps);card.querySelector('.progression-tip').textContent=progressionTip(name,+card.dataset.groups,card.dataset.reps);card.querySelector('.exercise-guide').innerHTML=guideHtml(name)});
    document.querySelectorAll('#setTracker .skip-exercise').forEach(x=>x.onchange=()=>x.closest('.exercise-track').classList.toggle('skipped',x.checked));
    document.querySelectorAll('#setTracker .set-check').forEach(x=>x.addEventListener('change',()=>{if(x.checked)sessionStartedAt??=Date.now()},{once:true}));
    document.querySelectorAll('#setTracker .set-type').forEach(x=>x.onchange=()=>{const rir=x.closest('.set-box').querySelector('.rir');if(x.value==='failure')rir.value='0'});
    document.querySelectorAll('#setTracker .remove-set').forEach(x=>x.onclick=()=>{const sets=x.closest('.sets');if(sets.querySelectorAll('.set-box').length<=1)return toast('每个动作至少保留一组');x.closest('.set-box').remove();renumberCards()});
    document.querySelectorAll('#setTracker .add-set').forEach(x=>x.onclick=()=>{const card=x.closest('.exercise-track'),sets=card.querySelector('.sets'),box=document.createElement('div');box.className='set-box';box.innerHTML='<label><input class="set-check" type="checkbox">新组</label><input class="kg" type="number" step="0.5" min="0" placeholder="重量kg"><input class="reps" type="number" min="0" placeholder="次数">';sets.append(box);setBoxUpgrade(box,sets.querySelectorAll('.set-box').length-1);bindTrackerControls();renumberCards()});
    document.querySelectorAll('#setTracker .move-up').forEach(x=>x.onclick=()=>{const card=x.closest('.exercise-track'),prev=card.previousElementSibling;if(prev?.classList.contains('exercise-track'))card.parentElement.insertBefore(card,prev);renumberCards()});
    document.querySelectorAll('#setTracker .move-down').forEach(x=>x.onclick=()=>{const card=x.closest('.exercise-track'),next=card.nextElementSibling;if(next?.classList.contains('exercise-track'))card.parentElement.insertBefore(next,card);renumberCards()});
    document.querySelectorAll('#setTracker .superset-next').forEach(x=>x.onchange=()=>{const card=x.closest('.exercise-track');card.dataset.superset=String(x.checked);card.classList.toggle('is-superset',x.checked)});
    document.querySelectorAll('#setTracker .remove-exercise').forEach(x=>x.onclick=()=>{if(document.querySelectorAll('#setTracker .exercise-track').length<=1)return toast('至少保留一个动作');x.closest('.exercise-track').remove();renumberCards()});
    if($('addExercise'))$('addExercise').onclick=()=>{let name=$('exerciseSearch').value.trim();if(!name)name=prompt('输入要添加的动作名称：')?.trim();if(!name)return;const card=buildExerciseCard(name);$('trackerTools').before(card);$('exerciseSearch').value='';enhanceTracker();card.scrollIntoView({behavior:'smooth',block:'center'})};
    if($('saveTemplate'))$('saveTemplate').onclick=saveTemplate;
    if($('loadTemplate'))$('loadTemplate').onclick=loadTemplate;
    if($('deleteTemplate'))$('deleteTemplate').onclick=deleteTemplate;
  }
  function currentStructure(){return[...document.querySelectorAll('#setTracker .exercise-track')].map(card=>({name:card.dataset.name,groups:card.querySelectorAll('.set-box').length,reps:card.dataset.reps||'8–12',superset:card.querySelector('.superset-next')?.checked||false}))}
  function refreshTrackerToolbar(selected=''){const old=$('trackerTools');if(!old)return;old.outerHTML=trackerToolbar();if(selected!==''&&$('templateChoice'))$('templateChoice').value=String(selected);bindTrackerControls()}
  function saveTemplate(){
    const structure=currentStructure();if(!structure.length)return;
    const name=prompt('给这套训练结构起个名字：',`${plans[selectedPlan].title}自定义`)?.trim();if(!name)return;
    const item={name,updatedAt:new Date().toISOString(),exercises:structure},i=data.templates.findIndex(x=>x.name===name);if(i>=0)data.templates[i]=item;else data.templates.push(item);
    saveUpgrades();refreshTrackerToolbar(i>=0?i:data.templates.length-1);toast('自定义训练模板已保存');
  }
  function loadTemplate(){
    const raw=$('templateChoice').value;if(raw==='')return toast('请先选择一个模板');const i=+raw,item=data.templates[i];if(!item)return toast('请先选择一个模板');
    const tracker=$('setTracker');tracker.innerHTML='';item.exercises.forEach(x=>tracker.append(buildExerciseCard(x.name,x.groups,x.reps,x.superset)));tracker.insertAdjacentHTML('beforeend',trackerToolbar());$('templateChoice').value=String(i);enhanceTracker();toast(`已加载：${item.name}`);
  }
  function deleteTemplate(){
    const raw=$('templateChoice').value;if(raw==='')return toast('请先选择一个模板');const i=+raw,item=data.templates[i];if(!item)return toast('请先选择一个模板');if(!confirm(`删除模板“${item.name}”？`))return;data.templates.splice(i,1);saveUpgrades();refreshTrackerToolbar();toast('模板已删除');
  }
  renderTracker=function(){baseRenderTracker();enhanceTracker();if($('readinessAdvice'))$('readinessAdvice').textContent=readinessText(latestReadiness())};

  doneEntries=function(exercise){return(exercise?.entries||[]).filter(x=>x.done).map(x=>({kg:+x.kg||0,reps:+x.reps||0,rir:x.rir===''||x.rir==null?null:+x.rir,setType:x.setType||'work'}))};
  function workEntries(exercise){return doneEntries(exercise).filter(x=>x.setType!=='warmup')}
  function estimated1RM(entry){if(!entry?.kg||!entry?.reps)return 0;const effective=Math.min(15,entry.reps+(entry.rir??0));return Math.round(entry.kg*(1+effective/30)*10)/10}
  workoutVolume=function(sets){return Math.round(sets.reduce((sum,s)=>s.skipped?sum:sum+workEntries(s).reduce((a,x)=>a+x.kg*x.reps,0),0))};
  historicalBest=function(name){return Math.max(0,...data.records.flatMap(r=>r.sets||[]).filter(x=>x.name===name).flatMap(workEntries).map(x=>x.kg))};
  function historicalE1RM(name){return Math.max(0,...data.records.flatMap(r=>r.sets||[]).filter(x=>x.name===name).flatMap(workEntries).map(estimated1RM))}
  exerciseHistory=function(name){return data.records.map(r=>{const ex=r.sets?.find(x=>x.name===name),done=workEntries(ex);return done.length?{date:r.date,best:Math.max(...done.map(x=>x.kg)),volume:Math.round(done.reduce((a,x)=>a+x.kg*x.reps,0)),e1rm:Math.max(...done.map(estimated1RM))}:null}).filter(Boolean)};

  function primaryMuscle(name){
    if(/胸推|推胸|卧推|夹胸|飞鸟|俯卧撑/.test(name))return'胸';
    if(/下拉|划船|拉背|直臂|引体/.test(name))return'背';
    if(/肩推|推肩|侧平举|飞肩|后束|面拉/.test(name))return'肩';
    if(/臂屈伸|下压|三头|双杠/.test(name))return'三头';
    if(/弯举|二头/.test(name))return'二头';
    if(/臀推|臀桥|外展|内收/.test(name))return'臀';
    if(/卷腹|举腿|平板支撑|死虫|Pallof|鸟狗/.test(name))return'腹';
    if(/提踵|小腿/.test(name))return'小腿';
    if(/腿|深蹲|倒蹬|哈克|硬拉/.test(name))return'腿';
    return'其他';
  }
  function renderRecoveryAnalytics(){
    if(!$('weeklyAnalytics'))return;
    const from=new Date();from.setDate(from.getDate()-6);from.setHours(0,0,0,0);
    const records=data.records.filter(r=>new Date(`${r.date}T00:00:00`)>=from),muscles={},all=[];
    records.forEach(r=>(r.sets||[]).forEach(s=>{if(s.skipped)return;const entries=workEntries(s);if(!entries.length)return;const m=primaryMuscle(s.name);muscles[m]=(muscles[m]||0)+entries.length;all.push(...entries)}));
    const totalSets=all.length,totalVolume=Math.round(all.reduce((a,x)=>a+x.kg*x.reps,0)),bestE1rm=Math.max(0,...all.map(estimated1RM));
    $('weeklyWorkSets').textContent=totalSets;$('weeklyVolume').textContent=totalVolume;$('weeklyE1rm').textContent=bestE1rm;
    const max=Math.max(1,...Object.values(muscles));
    $('weeklyMuscle').innerHTML=muscleOrder.filter(m=>muscles[m]).map(m=>`<div class="muscle-row"><span>${m}</span><div><i style="width:${Math.round(muscles[m]/max*100)}%"></i></div><strong>${muscles[m]}组</strong></div>`).join('')||'<p class="empty">保存训练后，这里会按肌群统计最近7天的有效正式组。</p>';
    const readiness=latestReadiness(),recent=data.records.slice(-3),rirValues=recent.flatMap(r=>(r.sets||[]).flatMap(workEntries)).map(x=>x.rir).filter(x=>x!=null),avgRir=rirValues.length?rirValues.reduce((a,x)=>a+x,0)/rirValues.length:null,overloaded=Object.entries(muscles).filter(([,n])=>n>18).map(([m])=>m);
    let text='当前数据没有显示必须减量；保持动作质量、睡眠和蛋白质摄入。',state='good';
    if(readiness?.pain==='clear'){text='今天记录了明显不适：避开疼痛动作，优先快速或恢复训练；疼痛持续或加重应停止并就医。';state='warn'}
    else if(overloaded.length){text=`${overloaded.join('、')}最近7天超过18个有效组，建议下次减量30%–40%，先恢复再加量。`;state='warn'}
    else if(recent.length>=3&&avgRir!=null&&avgRir<=1.2&&(readiness?.energy<=2||readiness?.soreness>=4||readiness?.sleep<6)){text='最近3次训练普遍接近力竭，同时恢复状态偏低：下一次建议快速模式，重量或组数减少约30%。';state='warn'}
    else if(!totalSets){text='还没有足够的训练数据。完成训练并填写 RIR 后，系统会提示是否需要减量。';state='neutral'}
    $('deloadAdvice').className=`deload-advice ${state}`;$('deloadAdvice').textContent=text;
  }

  function collectWorkout(){
    const p=plans[selectedPlan],warmup=[...document.querySelectorAll('.warmup-step')].map(e=>({name:e.dataset.name,done:e.querySelector('.warmup-check').checked}));
    const sets=[...document.querySelectorAll('#setTracker .exercise-track')].map(e=>({name:e.dataset.name,skipped:e.classList.contains('skipped'),superset:e.querySelector('.superset-next')?.checked||false,entries:[...e.querySelectorAll('.set-box')].map(x=>({done:x.querySelector('.set-check').checked,kg:x.querySelector('.kg').value,reps:x.querySelector('.reps').value,setType:x.querySelector('.set-type')?.value||'work',rir:x.querySelector('.rir')?.value??''}))}));
    return{p,warmup,sets};
  }
  function showSummary(record){
    const work=record.sets.flatMap(workEntries),exercises=record.sets.filter(x=>!x.skipped&&workEntries(x).length).length,avgRir=work.map(x=>x.rir).filter(x=>x!=null),rir=avgRir.length?(avgRir.reduce((a,x)=>a+x,0)/avgRir.length).toFixed(1):'未填';
    $('summaryTitle').textContent=`${record.type.replace(/^训练\d：/,'')}完成`;
    $('summaryStats').innerHTML=`<div><strong>${record.duration}</strong><span>分钟</span></div><div><strong>${exercises}</strong><span>动作</span></div><div><strong>${work.length}</strong><span>有效组</span></div><div><strong>${record.volume}</strong><span>总容量kg</span></div><div><strong>${record.bestE1rm}</strong><span>最高估算1RM</span></div><div><strong>${rir}</strong><span>平均RIR</span></div>`;
    $('summaryPrs').textContent=record.prs.length?`🏆 新纪录：${record.prs.join('、')}`:'本次没有刷新纪录，稳定完成同样值得记录。';
    $('summaryReadiness').textContent=record.readiness?`练前状态 ${record.readiness.score}/100｜${volumeLabels[record.readiness.mode]}模式`:'本次未填写练前状态。';
    $('workoutSummary').hidden=false;
    $('copySummary').onclick=async()=>{const text=`${record.date} ${record.type}\n${record.duration}分钟｜${exercises}个动作｜${work.length}个有效组｜容量${record.volume}kg｜最高估算1RM ${record.bestE1rm}kg${record.prs.length?`\n新纪录：${record.prs.join('、')}`:''}`;try{await navigator.clipboard.writeText(text);toast('训练战报已复制')}catch{prompt('复制下面的训练战报：',text)}};
  }
  function bindFinishWorkout(){
    $('finishWorkout').onclick=()=>{
      const {p,warmup,sets}=collectWorkout();if(!sets.some(x=>!x.skipped&&workEntries(x).length))return toast('请至少勾选一组实际完成的正式训练');
      const prs=sets.filter(x=>Math.max(0,...workEntries(x).map(estimated1RM))>historicalE1RM(x.name)).map(x=>x.name),volume=workoutVolume(sets),work=sets.flatMap(workEntries),duration=Math.max(1,Math.round((Date.now()-(sessionStartedAt||Date.now()-60*60*1000))/60000)),bestE1rm=Math.max(0,...work.map(estimated1RM)),readiness=latestReadiness();
      if(sessionGym.includes('铁锤')&&data.hammerUsed<7)data.hammerUsed++;
      const record={date:dateKey(),gym:sessionGym,type:p.type,duration:String(duration),feeling:'按现场状态调整完成',note:p.cardio,warmup,sets,volume,prs,bestE1rm,readiness};
      stopRest();addRecord(record);warmupState={};selectedPlan=nextIndex();sessionGym=autoGym();sessionStartedAt=null;saveUpgrades();render();showSummary(record);toast(prs.length?`训练已保存，出现 ${prs.length} 项新纪录！`:`训练已保存｜总容量 ${volume}kg`);
    };
  }

  function csvCell(value){const s=String(value??'');return/[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
  function exportCsv(){
    const rows=[['日期','健身房','训练类型','动作','组序号','组类型','重量kg','次数','RIR','容量kg','超级组']];
    data.records.forEach(r=>(r.sets||[]).forEach(s=>(s.entries||[]).forEach((x,i)=>{if(x.done)rows.push([r.date,r.gym,r.type,s.name,i+1,x.setType||'work',x.kg,x.reps,x.rir??'',(+x.kg||0)*(+x.reps||0),s.superset?'是':'否'])})));
    downloadFile(`fitness-training-${dateKey()}.csv`,'\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\n'),'text/csv;charset=utf-8');toast('CSV 已导出');
  }
  function renderBackupStatus(){
    if(!$('backupStatus'))return;const raw=localStorage.getItem(backupKey);if(!raw){$('backupStatus').textContent='还没有自动备份。';return}try{const item=JSON.parse(raw),d=new Date(item.at);$('backupStatus').textContent=`最近自动备份：${d.toLocaleString('zh-CN')}｜${item.data?.records?.length||0}条训练记录`}catch{$('backupStatus').textContent='自动备份读取失败，请导出 JSON 备份。'}
  }
  function restoreAutoBackup(){
    const raw=localStorage.getItem(backupKey);if(!raw)return toast('当前没有可恢复的自动备份');if(!confirm('用最近的自动备份覆盖当前本机数据？'))return;
    try{const item=JSON.parse(raw);if(!Array.isArray(item.data?.records))throw 0;data=item.data;ensureData();sessionGym=autoGym();save();render();toast('已恢复最近自动备份')}catch{alert('自动备份已损坏，无法恢复')}
  }
  function bindUpgradeUI(){
    if($('applyReadiness'))$('applyReadiness').onclick=applyReadiness;
    if($('closeSummary'))$('closeSummary').onclick=()=>{$('workoutSummary').hidden=true};
    if($('workoutSummary'))$('workoutSummary').onclick=e=>{if(e.target===$('workoutSummary'))$('workoutSummary').hidden=true};
    if($('exportCsv'))$('exportCsv').onclick=exportCsv;
    if($('restoreAutoBackup'))$('restoreAutoBackup').onclick=restoreAutoBackup;
  }

  render=function(){if(!readinessModeRestored){const item=latestReadiness();if(item){sessionVolume=item.mode;if($('sessionVolumeChoice'))$('sessionVolumeChoice').value=sessionVolume}readinessModeRestored=true}baseRender();injectUpgradeUI();restoreReadinessInputs();renderRecoveryAnalytics();renderBackupStatus();bindFinishWorkout()};
  document.addEventListener('click',()=>setTimeout(autoBackup,250),true);
  document.addEventListener('submit',()=>setTimeout(autoBackup,250),true);
  document.addEventListener('change',()=>setTimeout(autoBackup,250),true);
  window.addEventListener('pagehide',autoBackup);
  injectUpgradeUI();autoBackup();render();
})();
