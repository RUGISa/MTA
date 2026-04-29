const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");
const startScreen=document.getElementById("startScreen");
const settingScreen=document.getElementById("settingScreen");
const resumeBtn=document.getElementById("resumeBtn");
const sensitivitySlider=document.getElementById("sensitivitySlider");
const brightnessSlider=document.getElementById("brightnessSlider");

const keys={};
const mouse={dx:0};

const CONFIG={
  moveSpeed:0.024,runSpeed:0.04,tiredSpeedRate:0.5,tiredTime:300,tiredShakePower:12,tiredRecoverRate:0.5,
  staminaMax:25,staminaRecover:0.25,staminaRecoverDelay:60,runStaminaCost:0.45,dodgeStaminaCost:12,
  runHoldTime:14,runReadyStamina:6,dodgeTime:12,dodgeSpeed:0.07,dodgeCooldownMax:8,
  rotSpeed:0.0018,fov:70,rayCount:320,rayDepth:20,maxStage:10
};

const WALL_THEMES={
  wall_default:{name:"기본 벽",color:[170,170,166]},
  wall_concrete:{name:"콘크리트 벽",color:[134,136,132]},
  wall_brown:{name:"낡은 벽",color:[143,124,101]},
  wall_bluegray:{name:"푸른 회색 벽",color:[105,118,128]}
};

const FLOOR_THEMES={
  floor_default:{name:"기본 바닥",color:[48,48,46],ceiling:[22,22,22]},
  floor_warm:{name:"따뜻한 바닥",color:[61,53,44],ceiling:[25,23,21]},
  floor_cold:{name:"차가운 바닥",color:[42,48,53],ceiling:[20,22,24]},
  floor_moss:{name:"이끼 낀 바닥",color:[43,52,42],ceiling:[21,23,20]}
};

const CROSSHAIR_THEMES={
  cross_default:{name:"기본 조준점",color:"#eeeeee"},
  cross_amber:{name:"빛바랜 노랑",color:"#d2c18c"},
  cross_green:{name:"탁한 초록",color:"#9aaa8c"},
  cross_gray:{name:"회색 조준점",color:"#b6b6b6"}
};

const SHOP_ITEMS={
  wall_concrete:{type:"wall",name:WALL_THEMES.wall_concrete.name,desc:"차분한 회색 벽 테마입니다.",cost:2},
  wall_brown:{type:"wall",name:WALL_THEMES.wall_brown.name,desc:"조금 오래된 느낌의 벽 테마입니다.",cost:2},
  wall_bluegray:{type:"wall",name:WALL_THEMES.wall_bluegray.name,desc:"어두운 푸른빛의 벽 테마입니다.",cost:3},
  floor_warm:{type:"floor",name:FLOOR_THEMES.floor_warm.name,desc:"따뜻한 톤의 바닥 테마입니다.",cost:2},
  floor_cold:{type:"floor",name:FLOOR_THEMES.floor_cold.name,desc:"차가운 톤의 바닥 테마입니다.",cost:2},
  floor_moss:{type:"floor",name:FLOOR_THEMES.floor_moss.name,desc:"낡은 미로 느낌의 바닥 테마입니다.",cost:3},
  cross_amber:{type:"crosshair",name:CROSSHAIR_THEMES.cross_amber.name,desc:"노란빛이 살짝 도는 조준점입니다.",cost:1},
  cross_green:{type:"crosshair",name:CROSSHAIR_THEMES.cross_green.name,desc:"채도를 낮춘 초록 조준점입니다.",cost:1},
  cross_gray:{type:"crosshair",name:CROSSHAIR_THEMES.cross_gray.name,desc:"눈에 덜 튀는 회색 조준점입니다.",cost:1}
};

const SAVE_KEY="maze_time_attack_save";

let audioCtx=null;
let gameStarted=false,settingOpen=false,loopStarted=false,previewLoopStarted=false;
let gameMode="normal",speedrunStartTime=0;
let shopPage=0;
let inventoryPage=0;
let countdownActive=false,countdownStartTime=0,countdownCallback=null;
let stagePage=0,currentStage=1,mazeSize=2,stageStartTime=0,clearTime=0;
let sensitivity=0.75,brightness=1;
let x=1.5,y=1.5,dir=0,mapW=0,mapH=0,level=[];
let stamina=CONFIG.staminaMax,staminaIdleTimer=0,staminaRecoveryStarted=true;
let tiredTimer=0,tiredShakeTimer=0,spaceHold=0,prevSpace=false,spaceStartedRunning=false;
let isRunning=false,canRun=true,isDodging=false,dodgeTimer=0,dodgeCooldown=0,dodgeVecX=0,dodgeVecY=0;
let camBob=0,camFovAdd=0,previewReady=false,previewDir=0;

let saveData=createDefaultSave();

function createDefaultSave(){
  return {
    unlockedStage:1,
    stages:{},
    ownedThemes:{wall_default:true,floor_default:true,cross_default:true},
    equippedTheme:{wall:"wall_default",floor:"floor_default",crosshair:"cross_default"},
    speedrunUnlocked:false,
    bestSpeedrun:null
  };
}

function normalizeSaveData(data){
  const base=createDefaultSave();
  return {
    unlockedStage:data.unlockedStage||1,
    stages:data.stages||{},
    ownedThemes:{...base.ownedThemes,...(data.ownedThemes||{})},
    equippedTheme:{...base.equippedTheme,...(data.equippedTheme||{})},
    speedrunUnlocked:data.speedrunUnlocked||false,
    bestSpeedrun:data.bestSpeedrun||null
  };
}

function loadSave(){
  const raw=localStorage.getItem(SAVE_KEY);
  if(!raw)return;
  try{
    saveData=normalizeSaveData(JSON.parse(raw));
    if(isAllNormalStagesCleared()){
      saveData.speedrunUnlocked=true;
      saveGame();
    }
  }catch{
    saveData=createDefaultSave();
  }
}

function saveGame(){localStorage.setItem(SAVE_KEY,JSON.stringify(saveData));}

function getAudioContext(){
  if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==="suspended")audioCtx.resume();
  return audioCtx;
}

function unlockAudio(){
  const a=getAudioContext(),o=a.createOscillator(),g=a.createGain();
  g.gain.value=0.0001;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+0.02);
}

function playPantSound(){
  const a=getAudioContext();
  for(let i=0;i<5;i++){
    const st=a.currentTime+i*0.65,size=Math.floor(a.sampleRate*0.38),b=a.createBuffer(1,size,a.sampleRate),d=b.getChannelData(0);
    for(let j=0;j<size;j++)d[j]=(Math.random()*2-1)*0.75;
    const n=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
    n.buffer=b;f.type="bandpass";f.frequency.value=680;f.Q.value=0.85;
    g.gain.setValueAtTime(0.0001,st);g.gain.exponentialRampToValueAtTime(0.38,st+0.06);g.gain.exponentialRampToValueAtTime(0.0001,st+0.38);
    n.connect(f);f.connect(g);g.connect(a.destination);n.start(st);n.stop(st+0.42);
  }
}

function isAllNormalStagesCleared(){
  for(let i=1;i<=CONFIG.maxStage;i++)if(!saveData.stages[i])return false;
  return true;
}

function ownsTheme(id){return !!saveData.ownedThemes[id];}
function getSpentStars(){let s=0;for(const id in SHOP_ITEMS)if(ownsTheme(id))s+=SHOP_ITEMS[id].cost;return s;}
function getTotalStars(){let t=0;for(let i=1;i<=CONFIG.maxStage;i++){const r=saveData.stages[i];if(r)t+=r.stars||0;}return t;}
function getAvailableStars(){return getTotalStars()-getSpentStars();}
function canBuyTheme(id){return SHOP_ITEMS[id]&&!ownsTheme(id)&&getAvailableStars()>=SHOP_ITEMS[id].cost;}

function buyTheme(id){
  if(!canBuyTheme(id))return;
  saveData.ownedThemes[id]=true;
  saveGame();
  renderShop();
}

function equipTheme(type,id){
  if(!ownsTheme(id))return;
  saveData.equippedTheme[type]=id;
  saveGame();
  if(!gameStarted)generatePreviewRoom();
  renderInventory();
}

function getEquippedWallTheme(){return WALL_THEMES[saveData.equippedTheme.wall]||WALL_THEMES.wall_default;}
function getEquippedFloorTheme(){return FLOOR_THEMES[saveData.equippedTheme.floor]||FLOOR_THEMES.floor_default;}
function getEquippedCrosshairTheme(){return CROSSHAIR_THEMES[saveData.equippedTheme.crosshair]||CROSSHAIR_THEMES.cross_default;}

function getThemeData(id){
  return WALL_THEMES[id]||FLOOR_THEMES[id]||CROSSHAIR_THEMES[id]||null;
}

function getScenePreview(wallColor,floorColor,ceilingColor,small=false){
  return `
    <div class="item-preview maze-preview ${small?"small-preview":""}">
      <div class="preview-ceiling" style="background:${rgb(ceilingColor)}"></div>
      <div class="preview-floor" style="background:${rgb(floorColor)}"></div>
      <div class="preview-back-wall" style="background:${rgb(wallColor)}"></div>
      <div class="preview-left-wall" style="background:${rgb(wallColor)}"></div>
      <div class="preview-right-wall" style="background:${rgb(wallColor)}"></div>
      <div class="preview-fog"></div>
    </div>
  `;
}

function getShopItemPreview(id){
  const item=SHOP_ITEMS[id];
  const theme=getThemeData(id);
  if(!item||!theme)return "";

  const wall=getEquippedWallTheme();
  const floor=getEquippedFloorTheme();

  if(item.type==="wall"){
    return getScenePreview(theme.color,floor.color,floor.ceiling);
  }

  if(item.type==="floor"){
    return getScenePreview(wall.color,theme.color,theme.ceiling);
  }

  return `<div class="item-preview cross-preview"><span style="color:${theme.color}">+</span></div>`;
}

function getInventoryPreview(type,id){
  const theme=getThemeData(id);
  if(!theme)return "";

  const wall=getEquippedWallTheme();
  const floor=getEquippedFloorTheme();

  if(type==="wall"){
    return getScenePreview(theme.color,floor.color,floor.ceiling,true);
  }

  if(type==="floor"){
    return getScenePreview(wall.color,theme.color,theme.ceiling,true);
  }

  return `<div class="item-preview cross-preview small-preview"><span style="color:${theme.color}">+</span></div>`;
}

function getMaxStamina(){return CONFIG.staminaMax;}
function getStaminaRecover(){return CONFIG.staminaRecover;}
function getTiredTime(){return CONFIG.tiredTime;}

function getStarLimit(stage){return {three:12000+stage*4000,two:20000+stage*6000,one:35000+stage*8000};}
function getStarRuleText(stage){
  const l=getStarLimit(stage);
  return `★★★ ${formatTime(l.three)} 이내\n★★☆ ${formatTime(l.two)} 이내\n★☆☆ ${formatTime(l.one)} 이내`;
}
function calculateStars(stage,time){
  const l=getStarLimit(stage);
  if(time<=l.three)return 3;
  if(time<=l.two)return 2;
  if(time<=l.one)return 1;
  return 0;
}
function formatTime(ms){
  const m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000),n=Math.floor(ms%1000);
  return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")+"."+String(n).padStart(3,"0");
}

function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
function degToRad(d){return d*Math.PI/180;}
function cosd(d){return Math.cos(degToRad(d));}
function sind(d){return Math.sin(degToRad(d));}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function randInt(max){return Math.floor(Math.random()*(max+1));}
function scaleColor(c,r){return c.map(v=>clamp(Math.floor(v*r*brightness),0,255));}
function rgb(c){return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;}

function isWalkable(tx,ty){
  if(tx<0||tx>=mapW||ty<0||ty>=mapH)return false;
  return level[ty][tx]===0||level[ty][tx]===3;
}

function clearInputState(){
  for(const k in keys)keys[k]=false;
  mouse.dx=0;prevSpace=false;spaceHold=0;spaceStartedRunning=false;isRunning=false;
}

function setMenuHTML(html){startScreen.innerHTML=html;}

function ensureExitButton(){
  if(!settingScreen||document.getElementById("exitStageBtn"))return;
  const b=document.createElement("button");
  b.id="exitStageBtn";b.textContent="나가기";
  b.style.cssText="width:100%;margin-top:10px;padding:14px 18px;border:none;border-radius:14px;background:#2a2a2a;color:#eee;font-size:16px;font-weight:bold;cursor:pointer;";
  b.addEventListener("click",exitToMainMenu);
  (settingScreen.querySelector("div")||settingScreen).appendChild(b);
}

function exitToMainMenu(){
  gameStarted=false;settingOpen=false;loopStarted=false;countdownActive=false;countdownCallback=null;
  settingScreen.classList.add("hidden");startScreen.classList.remove("hidden");
  clearInputState();
  if(document.pointerLockElement===canvas)document.exitPointerLock();
  generatePreviewRoom();renderMainMenu();startPreviewLoop();
}

function showMenuScreen(){
  startScreen.classList.remove("hidden");settingScreen.classList.add("hidden");
  gameStarted=false;settingOpen=false;countdownActive=false;countdownCallback=null;
  clearInputState();
  if(document.pointerLockElement===canvas)document.exitPointerLock();
  generatePreviewRoom();startPreviewLoop();
}

function openSettings(exitLock=true){
  settingOpen=true;settingScreen.classList.remove("hidden");ensureExitButton();clearInputState();
  if(exitLock&&document.pointerLockElement===canvas)document.exitPointerLock();
}

function closeSettings(){
  settingOpen=false;settingScreen.classList.add("hidden");clearInputState();
  setTimeout(()=>{if(gameStarted&&!settingOpen)canvas.requestPointerLock();},0);
}

function renderMainMenu(){
  const best=saveData.bestSpeedrun?`BEST ${formatTime(saveData.bestSpeedrun)}`:"BEST --:--.---";
  setMenuHTML(`
    <div class="menu-box">
      <h1 class="menu-title">MTA</h1>
      <p class="menu-subtitle">MAZE TIME ATTACK</p>
      <div class="menu-buttons">
        <button id="normalModeBtn">일반 모드</button>
        <button id="speedrunModeBtn" ${saveData.speedrunUnlocked?"":"disabled"}>스피드런 모드<br><span class="item-meta">${saveData.speedrunUnlocked?best:"일반 모드 1~10 클리어 후 해금"}</span></button>
        <button id="shopMenuBtn">상점</button>
        <button id="inventoryMenuBtn">인벤토리</button>
      </div>
    </div>`);
  document.getElementById("normalModeBtn").addEventListener("click",()=>{unlockAudio();gameMode="normal";stagePage=0;renderStageSelect();});
  document.getElementById("speedrunModeBtn").addEventListener("click",()=>{if(!saveData.speedrunUnlocked)return;unlockAudio();startSpeedrunWithCountdown();});
  document.getElementById("shopMenuBtn").addEventListener("click",renderShop);
  document.getElementById("inventoryMenuBtn").addEventListener("click",renderInventory);
}

function renderStageSelect(){
  const pageStart=stagePage===0?1:6,pageEnd=stagePage===0?5:10;
  let html=`<div class="menu-box"><h1 class="menu-title">일반 모드</h1><p class="menu-subtitle">스테이지 위에 마우스를 올리면 별 획득 기준을 확인할 수 있습니다.</p><div class="stage-page-wrap"><button id="prevPageBtn" class="page-arrow" ${stagePage===0?"disabled":""}>◀</button><div class="stage-grid">`;
  for(let stage=pageStart;stage<=pageEnd;stage++){
    const unlocked=stage<=saveData.unlockedStage,record=saveData.stages[stage];
    const bestTime=record?formatTime(record.bestTime):"--:--.---";
    const stars=record?"★".repeat(record.stars)+"☆".repeat(3-record.stars):"☆☆☆";
    html+=`<button class="stageBtn" data-stage="${stage}" title="${getStarRuleText(stage)}" ${unlocked?"":"disabled"}>${unlocked?`STAGE ${stage}`:"LOCKED"}<br>${stars}<br>${bestTime}</button>`;
  }
  html+=`</div><button id="nextPageBtn" class="page-arrow" ${stagePage===1?"disabled":""}>▶</button></div><button id="backMainBtn" class="menu-back">뒤로</button></div>`;
  setMenuHTML(html);
  document.getElementById("backMainBtn").addEventListener("click",renderMainMenu);
  document.getElementById("prevPageBtn").addEventListener("click",()=>{stagePage=0;renderStageSelect();});
  document.getElementById("nextPageBtn").addEventListener("click",()=>{stagePage=1;renderStageSelect();});
  document.querySelectorAll(".stageBtn").forEach(b=>b.addEventListener("click",()=>{
    const stage=Number(b.dataset.stage);
    if(stage<=saveData.unlockedStage){unlockAudio();gameMode="normal";startStage(stage);}
  }));
}

function renderShop(){
  const shopIds=Object.keys(SHOP_ITEMS);
  const pageSize=4;
  const maxPage=Math.ceil(shopIds.length/pageSize)-1;
  shopPage=clamp(shopPage,0,maxPage);

  const start=shopPage*pageSize;
  const pageItems=shopIds.slice(start,start+pageSize);
  let cards="";

  for(const id of pageItems){
    const item=SHOP_ITEMS[id],owned=ownsTheme(id),enough=getAvailableStars()>=item.cost;
    let status=`${item.cost}★`;
    if(owned)status="구매 완료";else if(!enough)status="별 부족";

    cards+=`
      <button class="shop-card shopItemBtn" data-theme="${id}" ${owned||!enough?"disabled":""}>
        ${getShopItemPreview(id)}
        <strong>${item.name}</strong>
        <span class="item-meta">${item.desc}</span>
        <span class="${owned?"item-owned":""}">${status}</span>
      </button>
    `;
  }

  setMenuHTML(`
    <div class="menu-box shop-menu-box">
      <h1 class="menu-title">상점</h1>
      <p class="menu-subtitle">벽, 바닥, 조준점 테마를 구매할 수 있습니다.<br>총 별: ${getTotalStars()}개 / 사용한 별: ${getSpentStars()}개 / 사용 가능 별: ${getAvailableStars()}개</p>

      <div class="stage-page-wrap shop-page-wrap">
        <button id="prevShopPageBtn" class="page-arrow" ${shopPage===0?"disabled":""}>◀</button>
        <div class="shop-grid">${cards}</div>
        <button id="nextShopPageBtn" class="page-arrow" ${shopPage===maxPage?"disabled":""}>▶</button>
      </div>

      <p class="menu-subtitle shop-page-text">${shopPage+1} / ${maxPage+1}</p>
      <button id="backMainBtn" class="menu-back">뒤로</button>
    </div>
  `);

  document.querySelectorAll(".shopItemBtn").forEach(b=>b.addEventListener("click",()=>buyTheme(b.dataset.theme)));
  document.getElementById("prevShopPageBtn").addEventListener("click",()=>{shopPage--;renderShop();});
  document.getElementById("nextShopPageBtn").addEventListener("click",()=>{shopPage++;renderShop();});
  document.getElementById("backMainBtn").addEventListener("click",renderMainMenu);
}

function renderInventoryGroup(title,type,themes){
  let html=`<p class="theme-text"><strong>${title}</strong></p><div class="inventory-grid">`;
  for(const id in themes){
    const theme=themes[id],owned=ownsTheme(id),equipped=saveData.equippedTheme[type]===id;
    html+=`
      <button class="inventory-card equipItemBtn" data-type="${type}" data-theme="${id}" ${owned?"":"disabled"}>
        ${getInventoryPreview(type,id)}
        <strong>${theme.name}</strong>
        <span class="item-meta">${owned?(equipped?"장착 중":"장착하기"):"미보유"}</span>
      </button>
    `;
  }
  return html+"</div><br>";
}

function getInventoryPages(){
  return [
    {title:"벽",type:"wall",themes:WALL_THEMES},
    {title:"바닥",type:"floor",themes:FLOOR_THEMES},
    {title:"조준점",type:"crosshair",themes:CROSSHAIR_THEMES}
  ];
}

function renderInventory(){
  const pages=getInventoryPages();
  const maxPage=pages.length-1;
  inventoryPage=clamp(inventoryPage,0,maxPage);

  const page=pages[inventoryPage];
  let cards="";

  for(const id in page.themes){
    const theme=page.themes[id];
    const owned=ownsTheme(id);
    const equipped=saveData.equippedTheme[page.type]===id;

    cards+=`
      <button class="inventory-card equipItemBtn" data-type="${page.type}" data-theme="${id}" ${owned?"":"disabled"}>
        ${getInventoryPreview(page.type,id)}
        <strong>${theme.name}</strong>
        <span class="item-meta">${owned?(equipped?"장착 중":"장착하기"):"미보유"}</span>
      </button>
    `;
  }

  setMenuHTML(`
    <div class="menu-box shop-menu-box inventory-menu-box">
      <h1 class="menu-title">인벤토리</h1>
      <p class="menu-subtitle">구매한 테마를 장착할 수 있습니다.</p>

      <div class="stage-page-wrap shop-page-wrap">
        <button id="prevInventoryPageBtn" class="page-arrow" ${inventoryPage===0?"disabled":""}>◀</button>
        <div>
          <p class="theme-text"><strong>${page.title}</strong></p>
          <div class="inventory-grid">${cards}</div>
        </div>
        <button id="nextInventoryPageBtn" class="page-arrow" ${inventoryPage===maxPage?"disabled":""}>▶</button>
      </div>

      <p class="menu-subtitle shop-page-text">${inventoryPage+1} / ${maxPage+1}</p>
      <button id="backMainBtn" class="menu-back">뒤로</button>
    </div>
  `);

  document.querySelectorAll(".equipItemBtn").forEach(b=>b.addEventListener("click",()=>equipTheme(b.dataset.type,b.dataset.theme)));
  document.getElementById("prevInventoryPageBtn").addEventListener("click",()=>{inventoryPage--;renderInventory();});
  document.getElementById("nextInventoryPageBtn").addEventListener("click",()=>{inventoryPage++;renderInventory();});
  document.getElementById("backMainBtn").addEventListener("click",renderMainMenu);
}

function renderClearScreen(stage,time,stars,isNewBest){
  showMenuScreen();
  setMenuHTML(`<div class="menu-box"><h1 class="menu-title">STAGE ${stage} CLEAR</h1><p class="menu-subtitle">클리어 타임</p><h2>${formatTime(time)}</h2><h2>${"★".repeat(stars)}${"☆".repeat(3-stars)}</h2><p class="menu-subtitle">${isNewBest?"NEW BEST!":"기록 저장 완료"}</p><div class="menu-buttons"><button id="retryStageBtn">다시 도전</button><button id="nextStageBtn">다음 스테이지</button><button id="stageSelectBtn">스테이지 선택</button><button id="mainMenuBtn">메인화면</button></div></div>`);
  const nextBtn=document.getElementById("nextStageBtn");
  if(stage>=CONFIG.maxStage){nextBtn.textContent="마지막 스테이지 클리어";nextBtn.disabled=true;}
  document.getElementById("retryStageBtn").addEventListener("click",()=>{unlockAudio();gameMode="normal";startStage(stage);});
  nextBtn.addEventListener("click",()=>{if(stage<CONFIG.maxStage){unlockAudio();gameMode="normal";startStage(stage+1);}});
  document.getElementById("stageSelectBtn").addEventListener("click",()=>{stagePage=stage<=5?0:1;renderStageSelect();});
  document.getElementById("mainMenuBtn").addEventListener("click",renderMainMenu);
}

function startCountdown(callback){
  countdownActive=true;countdownStartTime=performance.now();countdownCallback=callback;
  startScreen.classList.add("hidden");settingScreen.classList.add("hidden");
  gameStarted=true;settingOpen=false;clearInputState();canvas.requestPointerLock();
  if(!loopStarted){loopStarted=true;requestAnimationFrame(gameLoop);}
}

function updateCountdown(){
  if(!countdownActive)return;
  if(performance.now()-countdownStartTime>=3000){
    countdownActive=false;
    const cb=countdownCallback;countdownCallback=null;
    if(cb)cb();
  }
}

function drawCountdown(w,h){
  if(!countdownActive)return;
  const left=Math.ceil((3000-(performance.now()-countdownStartTime))/1000);
  ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#eee";ctx.textAlign="center";ctx.font="bold 96px Arial";
  ctx.fillText(left>0?String(left):"GO",w/2,h/2);
  ctx.textAlign="left";
}

function startSpeedrunWithCountdown(){
  gameMode="speedrun";currentStage=1;mazeSize=2;
  resetStageState();generateMaze(mazeSize);
  startCountdown(()=>{speedrunStartTime=performance.now();stageStartTime=performance.now();});
}

function retrySpeedrun(){
  if(gameMode!=="speedrun")return;
  unlockAudio();gameMode="speedrun";currentStage=1;mazeSize=2;
  resetStageState();generateMaze(mazeSize);
  startCountdown(()=>{speedrunStartTime=performance.now();stageStartTime=performance.now();});
}

function finishSpeedrun(){
  const total=performance.now()-speedrunStartTime;
  const isNewBest=!saveData.bestSpeedrun||total<saveData.bestSpeedrun;
  if(isNewBest){saveData.bestSpeedrun=total;saveGame();}
  showMenuScreen();
  setMenuHTML(`<div class="menu-box"><h1 class="menu-title">SPEEDRUN CLEAR</h1><p class="menu-subtitle">1~10 스테이지 연속 클리어</p><h2>${formatTime(total)}</h2><p class="menu-subtitle">${isNewBest?"NEW BEST!":`BEST ${formatTime(saveData.bestSpeedrun)}`}</p><div class="menu-buttons"><button id="retrySpeedrunBtn">다시 도전</button><button id="mainMenuBtn">메인화면</button></div></div>`);
  document.getElementById("retrySpeedrunBtn").addEventListener("click",()=>{unlockAudio();startSpeedrunWithCountdown();});
  document.getElementById("mainMenuBtn").addEventListener("click",renderMainMenu);
}

function startStage(stage){
  unlockAudio();
  currentStage=stage;mazeSize=stage+1;
  startScreen.classList.add("hidden");settingScreen.classList.add("hidden");
  gameStarted=true;settingOpen=false;
  resetStageState();generateMaze(mazeSize);
  stageStartTime=performance.now();
  clearInputState();canvas.requestPointerLock();
  if(!loopStarted){loopStarted=true;requestAnimationFrame(gameLoop);}
}

function startNextSpeedrunStage(){
  const keepW=keys.KeyW,keepA=keys.KeyA,keepS=keys.KeyS,keepD=keys.KeyD,keepSpace=keys.Space;
  currentStage++;mazeSize=currentStage+1;
  resetStageState();generateMaze(mazeSize);
  stageStartTime=performance.now();
  keys.KeyW=keepW;keys.KeyA=keepA;keys.KeyS=keepS;keys.KeyD=keepD;keys.Space=keepSpace;
  mouse.dx=0;
}

function resetStageState(){
  stamina=getMaxStamina();staminaIdleTimer=0;staminaRecoveryStarted=true;
  tiredTimer=0;tiredShakeTimer=0;canRun=true;isRunning=false;isDodging=false;
  dodgeTimer=0;dodgeCooldown=0;camBob=0;camFovAdd=0;
}

function generateMaze(size){
  mapW=size*2+1;mapH=size*2+1;
  level=Array.from({length:mapH},()=>Array(mapW).fill(1));
  const visited=Array.from({length:size},()=>Array(size).fill(false));
  const stack=[],dirs=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
  visited[0][0]=true;level[1][1]=0;stack.push({x:0,y:0});
  while(stack.length>0){
    const cur=stack[stack.length-1],candidates=[];
    for(const d of dirs){
      const nx=cur.x+d.x,ny=cur.y+d.y;
      if(nx>=0&&nx<size&&ny>=0&&ny<size&&!visited[ny][nx])candidates.push({x:nx,y:ny,dx:d.x,dy:d.y});
    }
    if(candidates.length===0){stack.pop();continue;}
    const next=candidates[randInt(candidates.length-1)];
    const cx=cur.x*2+1,cy=cur.y*2+1,nx=next.x*2+1,ny=next.y*2+1;
    level[cy+next.dy][cx+next.dx]=0;level[ny][nx]=0;
    visited[next.y][next.x]=true;stack.push({x:next.x,y:next.y});
  }
  x=1.5;y=1.5;dir=0;
  level[mapH-2][mapW-2]=3;
  level[1][1]=0;level[1][2]=0;level[2][1]=0;
}

function generatePreviewRoom(){
  mapW=7;mapH=7;level=Array.from({length:mapH},()=>Array(mapW).fill(1));
  for(let yy=1;yy<=5;yy++)for(let xx=1;xx<=5;xx++)level[yy][xx]=0;
  level[1][1]=1;level[1][5]=1;level[5][1]=1;level[5][5]=1;level[2][3]=1;level[4][3]=1;
  x=3.5;y=3.5;dir=0;previewDir=0;camBob=0;camFovAdd=0;previewReady=true;
}

function startPreviewLoop(){
  if(!previewLoopStarted){previewLoopStarted=true;requestAnimationFrame(previewLoop);}
}

function previewLoop(){
  if(gameStarted){previewLoopStarted=false;return;}
  previewDir+=0.08;dir=previewDir;camBob=0;camFovAdd=0;drawMenuPreview();requestAnimationFrame(previewLoop);
}

function drawMenuPreview(){
  const w=canvas.width,h=canvas.height,centerY=h/2;
  ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
  drawBackground(w,h,centerY);drawRaycast(w,h,centerY,CONFIG.fov);
  ctx.fillStyle="rgba(0,0,0,.36)";ctx.fillRect(0,0,w,h);
}

function movePlayer(nx,ny){
  if(nx>=0&&nx<mapW&&isWalkable(Math.floor(nx),Math.floor(y)))x=nx;
  if(ny>=0&&ny<mapH&&isWalkable(Math.floor(x),Math.floor(ny)))y=ny;
}

function getMovementInput(){
  const fx=cosd(dir),fy=sind(dir),rx=cosd(dir+90),ry=sind(dir+90);
  let inputX=0,inputY=0;
  if(keys.KeyW){inputX+=fx;inputY+=fy;}
  if(keys.KeyS){inputX-=fx;inputY-=fy;}
  if(keys.KeyA){inputX-=rx;inputY-=ry;}
  if(keys.KeyD){inputX+=rx;inputY+=ry;}
  return {inputX,inputY,moving:inputX!==0||inputY!==0,fx,fy};
}

function triggerTiredState(){
  tiredTimer=getTiredTime();tiredShakeTimer=0;staminaRecoveryStarted=false;staminaIdleTimer=0;playPantSound();
}

function updateTiredState(){
  if(tiredTimer>0){tiredTimer--;tiredShakeTimer+=0.28;}else tiredShakeTimer=0;
}

function updateStaminaLock(){
  if(stamina<=0){
    stamina=0;
    if(canRun&&tiredTimer<=0)triggerTiredState();
    canRun=false;
  }
  if(!canRun&&stamina>=CONFIG.runReadyStamina)canRun=true;
}

function updateSpaceAction(inputX,inputY,moving,fx,fy){
  const now=!!keys.Space,pressed=now&&!prevSpace,released=!now&&prevSpace;
  if(pressed){spaceHold=0;spaceStartedRunning=false;}
  if(now)spaceHold++;
  isRunning=false;
  if(now&&spaceHold>=CONFIG.runHoldTime&&moving&&canRun&&!isDodging){
    isRunning=true;spaceStartedRunning=true;stamina-=CONFIG.runStaminaCost;
    if(stamina<=0){
      stamina=0;canRun=false;isRunning=false;
      if(tiredTimer<=0)triggerTiredState();
    }
  }
  if(released){tryDodge(inputX,inputY,fx,fy);spaceHold=0;spaceStartedRunning=false;}
  prevSpace=now;
}

function tryDodge(inputX,inputY,fx,fy){
  if(spaceStartedRunning||spaceHold<=0||spaceHold>=CONFIG.runHoldTime||isDodging||dodgeCooldown>0||stamina<CONFIG.dodgeStaminaCost)return;
  let dx=inputX,dy=inputY;
  if(dx===0&&dy===0){dx=-fx;dy=-fy;}
  const len=Math.hypot(dx,dy);
  if(len>0){dodgeVecX=dx/len;dodgeVecY=dy/len;}
  stamina=Math.max(0,stamina-CONFIG.dodgeStaminaCost);
  isDodging=true;dodgeTimer=CONFIG.dodgeTime;dodgeCooldown=CONFIG.dodgeCooldownMax;
}

function updateStaminaRecovery(moving){
  if(isRunning||isDodging)return;
  if(!staminaRecoveryStarted){
    if(moving){staminaIdleTimer=0;return;}
    staminaIdleTimer++;
    if(staminaIdleTimer<CONFIG.staminaRecoverDelay)return;
    staminaRecoveryStarted=true;
  }
  let recover=getStaminaRecover();
  if(tiredTimer>0)recover*=CONFIG.tiredRecoverRate;
  stamina=Math.min(getMaxStamina(),stamina+recover);
  if(stamina>=getMaxStamina()){staminaIdleTimer=0;staminaRecoveryStarted=true;}
}

function updateDodge(){
  const progress=dodgeTimer/CONFIG.dodgeTime;
  let speed=CONFIG.dodgeSpeed*progress;
  if(tiredTimer>0)speed*=CONFIG.tiredSpeedRate;
  movePlayer(x+dodgeVecX*speed,y+dodgeVecY*speed);
  dodgeTimer--;
  if(dodgeTimer<=0)isDodging=false;
}

function updateNormalMove(inputX,inputY){
  const len=Math.hypot(inputX,inputY);
  if(len<=0)return;
  let speed=isRunning?CONFIG.runSpeed:CONFIG.moveSpeed;
  if(tiredTimer>0)speed*=CONFIG.tiredSpeedRate;
  movePlayer(x+(inputX/len)*speed,y+(inputY/len)*speed);
}

function clearStage(){
  if(gameMode==="speedrun"){
    if(currentStage>=CONFIG.maxStage)finishSpeedrun();else startNextSpeedrunStage();
    return;
  }
  clearTime=performance.now()-stageStartTime;
  const stars=calculateStars(currentStage,clearTime),old=saveData.stages[currentStage];
  let isNewBest=false;
  if(!old||clearTime<old.bestTime){isNewBest=true;saveData.stages[currentStage]={bestTime:clearTime,stars};}
  else if(stars>old.stars)saveData.stages[currentStage].stars=stars;
  if(currentStage<CONFIG.maxStage)saveData.unlockedStage=Math.max(saveData.unlockedStage,currentStage+1);
  if(isAllNormalStagesCleared())saveData.speedrunUnlocked=true;
  saveGame();
  renderClearScreen(currentStage,clearTime,stars,isNewBest);
}

function checkExit(){
  if(level[Math.floor(y)][Math.floor(x)]!==3)return;
  clearStage();
}

function update(){
  if(settingOpen){mouse.dx=0;return;}
  if(countdownActive){updateCountdown();mouse.dx=0;return;}
  dir+=mouse.dx*CONFIG.rotSpeed*sensitivity*180/Math.PI;mouse.dx=0;
  if(dodgeCooldown>0)dodgeCooldown--;
  updateTiredState();
  const m=getMovementInput();
  updateStaminaLock();
  updateSpaceAction(m.inputX,m.inputY,m.moving,m.fx,m.fy);
  if(isDodging)updateDodge();else updateNormalMove(m.inputX,m.inputY);
  updateStaminaRecovery(m.moving);
  checkExit();
}

function draw(){
  const w=canvas.width,h=canvas.height;
  ctx.fillStyle="#050505";ctx.fillRect(0,0,w,h);
  updateCameraEffect();
  let tiredShake=0;
  if(tiredTimer>0){
    const power=CONFIG.tiredShakePower*(tiredTimer/getTiredTime());
    tiredShake=Math.sin(tiredShakeTimer)*power;
  }
  const centerY=h/2+camBob+tiredShake,currentFov=CONFIG.fov+camFovAdd;
  drawBackground(w,h,centerY);drawRaycast(w,h,centerY,currentFov);drawCrosshair(w,h);drawUI(w,h);drawCountdown(w,h);
}

function updateCameraEffect(){
  let bob=0,fov=0;
  if(isRunning){bob=8;fov=6;}else if(isDodging){bob=15;fov=8;}
  camBob=lerp(camBob,bob,0.12);camFovAdd=lerp(camFovAdd,fov,0.12);
}

function drawBackground(w,h,centerY){
  const f=getEquippedFloorTheme();
  ctx.fillStyle=rgb(scaleColor(f.ceiling,1));ctx.fillRect(0,0,w,centerY);
  ctx.fillStyle=rgb(scaleColor(f.color,1));ctx.fillRect(0,centerY,w,h-centerY);
}

function drawRaycast(w,h,centerY,currentFov){
  const sliceW=w/CONFIG.rayCount;
  for(let i=0;i<CONFIG.rayCount;i++){
    const rayAngle=dir-currentFov/2+(i/CONFIG.rayCount)*currentFov;
    const hit=castRay(rayAngle);
    drawExitFloor(i,sliceW,h,centerY,rayAngle,hit);
    drawWall(i,sliceW,h,centerY,rayAngle,hit);
  }
}

function castRay(rayAngle){
  let rayX=x,rayY=y,dist=0,hit=false,hitType=0,exitSeen=false,exitStartDist=-1,exitEndDist=-1;
  while(!hit&&dist<CONFIG.rayDepth){
    rayX+=cosd(rayAngle)*0.02;rayY+=sind(rayAngle)*0.02;dist+=0.02;
    const mapX=Math.floor(rayX),mapY=Math.floor(rayY);
    if(mapX<0||mapX>=mapW||mapY<0||mapY>=mapH){hit=true;hitType=1;continue;}
    const tile=level[mapY][mapX];
    if(tile===3){if(!exitSeen){exitSeen=true;exitStartDist=dist;}exitEndDist=dist;}
    if(tile===1||tile===2){hit=true;hitType=tile;}
  }
  return {dist,hitType,exitSeen,exitStartDist,exitEndDist};
}

function drawExitFloor(i,sliceW,h,centerY,rayAngle,hit){
  if(!hit.exitSeen||hit.exitStartDist<=0||hit.exitEndDist<=hit.exitStartDist)return;
  let start=hit.exitStartDist*cosd(rayAngle-dir),end=hit.exitEndDist*cosd(rayAngle-dir);
  start=Math.max(start,0.1);end=Math.max(end,0.1);
  let yNear=centerY+(h*0.55)/start,yFar=centerY+(h*0.55)/end;
  yNear=clamp(yNear,centerY,h);yFar=clamp(yFar,centerY,h);
  const shade=clamp(1.15-start*0.08,0.45,1.15);
  ctx.fillStyle=rgb(scaleColor([82,126,79],shade));
  ctx.fillRect(i*sliceW-0.5,yFar,sliceW+1,yNear-yFar);
}

function drawWall(i,sliceW,h,centerY,rayAngle,hit){
  let d=hit.dist*cosd(rayAngle-dir);
  d=Math.max(d,0.1);
  const wallH=h/d,top=centerY-wallH/2,bottom=centerY+wallH/2;
  const shade=clamp(1.25-d*0.08,0.22,1.15);
  ctx.fillStyle=rgb(scaleColor(getEquippedWallTheme().color,shade));
  ctx.fillRect(i*sliceW-0.5,top,sliceW+1,bottom-top);
}

function drawCrosshair(w,h){
  ctx.strokeStyle=getEquippedCrosshairTheme().color;ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(w/2-8,h/2);ctx.lineTo(w/2+8,h/2);
  ctx.moveTo(w/2,h/2-8);ctx.lineTo(w/2,h/2+8);
  ctx.stroke();
}

function drawUI(w,h){
  const uiX=30,uiY=h-50,barW=260,barH=18,rate=stamina/getMaxStamina();
  ctx.fillStyle="#eeeeee";ctx.font="14px Arial";
  ctx.fillText(`STAGE ${currentStage}`,30,35);
  ctx.fillText(`MAZE ${mazeSize} X ${mazeSize}`,30,58);
  if(gameMode==="speedrun"&&!countdownActive){
    ctx.fillText(`TOTAL ${formatTime(performance.now()-speedrunStartTime)}`,30,81);
    ctx.fillText("R RETRY",30,104);
  }
  if(tiredTimer>0)ctx.fillText("TIRED",30,gameMode==="speedrun"?127:81);
  ctx.fillStyle="#111";ctx.fillRect(uiX-2,uiY-2,barW+4,barH+4);
  ctx.fillStyle="#344233";ctx.fillRect(uiX,uiY,barW,barH);
  ctx.fillStyle="#93a976";ctx.fillRect(uiX,uiY,barW*rate,barH);
}

function gameLoop(){
  if(!gameStarted){loopStarted=false;return;}
  update();
  if(gameStarted){draw();requestAnimationFrame(gameLoop);}else loopStarted=false;
}

window.addEventListener("resize",()=>{resizeCanvas();if(!gameStarted)generatePreviewRoom();});
window.addEventListener("keydown",(e)=>{
  if(e.code==="Escape"&&gameStarted){
    e.preventDefault();
    if(settingOpen)closeSettings();else openSettings();
    return;
  }
  if(e.code==="KeyR"&&gameStarted&&gameMode==="speedrun"&&!settingOpen){
    e.preventDefault();retrySpeedrun();return;
  }
  if(!settingOpen&&!countdownActive)keys[e.code]=true;
});
window.addEventListener("keyup",(e)=>{keys[e.code]=false;});
window.addEventListener("mousemove",(e)=>{
  if(document.pointerLockElement===canvas&&!settingOpen&&!countdownActive)mouse.dx+=e.movementX;
});
document.addEventListener("pointerlockchange",()=>{
  if(!gameStarted)return;
  if(document.pointerLockElement!==canvas&&!settingOpen)openSettings(false);
});
canvas.addEventListener("click",()=>{
  unlockAudio();
  if(gameStarted&&!settingOpen&&document.pointerLockElement!==canvas)canvas.requestPointerLock();
});
if(sensitivitySlider)sensitivitySlider.addEventListener("input",()=>{sensitivity=Number(sensitivitySlider.value);});
if(brightnessSlider)brightnessSlider.addEventListener("input",()=>{brightness=Number(brightnessSlider.value);});
if(resumeBtn)resumeBtn.addEventListener("click",closeSettings);

resizeCanvas();
loadSave();
generatePreviewRoom();
renderMainMenu();
startPreviewLoop();
