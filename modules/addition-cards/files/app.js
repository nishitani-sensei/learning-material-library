let left=3,right=2;
const question=document.querySelector('#question'),answer=document.querySelector('#answer');
document.querySelector('#reveal').addEventListener('click',()=>{answer.textContent=String(left+right);});
document.querySelector('#next').addEventListener('click',()=>{left=1+Math.floor(Math.random()*9);right=1+Math.floor(Math.random()*9);question.textContent=`${left} ＋ ${right}`;answer.textContent='？';});
