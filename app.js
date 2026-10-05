const dialog=document.querySelector('#imageDialog');
const image=document.querySelector('#dialogImage');
const caption=document.querySelector('#dialogCaption');
let opener;
document.querySelectorAll('.zoom').forEach(button=>button.addEventListener('click',()=>{
  opener=button;
  image.src=button.dataset.image;
  image.alt=button.querySelector('img').alt;
  caption.textContent=button.dataset.caption;
  dialog.showModal();
  document.querySelector('#closeDialog').focus();
}));
document.querySelector('#closeDialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{image.removeAttribute('src');opener?.focus();});
