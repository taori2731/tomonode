const $ = id => document.getElementById(id);
let csrf='', confirmationId='', canSend=false, busy=false;
const messages={preview:'ネイティブ署名検証に成功しました。まだ送信していません。',sent:'Discordがテスト通知を受け付けました。実際の表示・通知はチャンネルで確認してください。',qualification_required:'資格なし・期限切れのため送信を拒否しました。',invalid_qualification:'署名または資格の検証に失敗し、送信しませんでした。',invalid_webhook:'Webhook URLを確認してください。',timeout:'通信タイムアウトです。届いている可能性があるため自動再送しません。',network_failed:'通信結果を確認できません。自動再送しません。',cancelled:'キャンセルしました。送信していません。',rate_limited:'Discordのレート制限で送信を終了しました。'};
function status(result) { $('status').textContent=messages[result]||`検証結果：${result}`; }
function lock(value) { busy=value; for(const el of document.querySelectorAll('input,select,button')) el.disabled=value;
  if(!value){$('role').disabled=$('mode').value!=='role';$('send').disabled=!canSend||!$('consent').checked;} }
function clearConfirmation(){confirmationId='';canSend=false;$('confirmation').hidden=true;$('consent').checked=false;}
async function api(route,body) { const response=await fetch(route,{method:'POST',headers:{'content-type':'application/json','x-lab-csrf':csrf},body:JSON.stringify(body)});
  const data=await response.json(); if(!response.ok) throw Error(data.error||'REQUEST_FAILED'); return data; }
async function action(task){if(busy)return;lock(true);try{await task();}catch{status('操作を完了できませんでした。入力・確認期限を確認するか、画面を開き直してください。');}finally{lock(false);}}
$('mode').addEventListener('change',()=>{$('role').disabled=$('mode').value!=='role';clearConfirmation();});
for(const id of ['locale','webhook','role']) $(id).addEventListener('input',clearConfirmation);
$('fixture').addEventListener('change',clearConfirmation);
$('consent').addEventListener('change',()=>{$('send').disabled=!canSend||!$('consent').checked;});
$('apply').addEventListener('click',()=>action(async()=>{clearConfirmation();await api('/api/fixture',{fixture:$('fixture').value});status('架空の会員状態を切り替えました。実アカウントは変更していません。');}));
$('prepare').addEventListener('click',()=>action(async()=>{
  clearConfirmation();const body={webhook:$('webhook').value.trim(),locale:$('locale').value,mode:$('mode').value,roleId:$('role').value.trim()};
  $('webhook').value='';let data;try{data=await api('/api/prepare',body);}finally{body.webhook='';}
  status(data.result);if(data.result==='preview'){$('preview').textContent=data.payload.content;$('qualified').textContent=data.nativeVerified&&data.releaseRejectsTest?'Rust検証成功・本番用の判定ではテスト資格を拒否しています。':'';
    confirmationId=data.confirmationId||'';canSend=data.canSend;$('confirmation').hidden=false;}
}));
$('send').addEventListener('click',()=>action(async()=>{
  if(!canSend||!$('consent').checked)return;const id=confirmationId;clearConfirmation();status('実Discordへ送信中です…');const data=await api('/api/send',{confirmationId:id,confirmed:true});status(data.result);
}));
$('cancel').addEventListener('click',()=>action(async()=>{clearConfirmation();await api('/api/cancel',{});status('cancelled');}));
fetch('/api/state').then(r=>r.json()).then(data=>{csrf=data.csrf;$('fixture').value=data.fixture;status('検証の準備ができました。Webhook未入力なら外部送信はありません。');}).catch(()=>status('検証画面を開き直してください。'));
