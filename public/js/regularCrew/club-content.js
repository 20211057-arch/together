const more = document.getElementById('club-members-more');
more?.addEventListener('click', () => {
    const expanded = more.getAttribute('aria-expanded') !== 'true';
    document.querySelectorAll('#panel-members .member-list-item').forEach((row, index) => row.classList.toggle('club-member-hidden', !expanded && index >= 8));
    more.setAttribute('aria-expanded', String(expanded));
    more.textContent = expanded ? '멤버 접기' : '멤버 더보기';
});
if (location.hash === '#members') document.getElementById('members')?.scrollIntoView();
document.querySelectorAll('[data-content-form]').forEach(form => {
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('[type=submit]');
        const status = form.querySelector('[role=status]');
        button.disabled = true;
        status.textContent = '등록 중입니다…';
        try {
            const photo = form.hasAttribute('data-photo-form');
            const response = await fetch(form.action, { method: 'POST', headers: photo ? { Accept:'application/json' } : { 'Content-Type':'application/json', Accept:'application/json' }, body: photo ? new FormData(form) : JSON.stringify(Object.fromEntries(new FormData(form))) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '등록에 실패했습니다.');
            location.hash = photo ? 'album' : 'board';
            location.reload();
        } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
});
document.querySelectorAll('[data-content-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('삭제하시겠습니까?')) return;
    button.disabled = true;
    try {
        const response = await fetch(button.dataset.contentDelete, { method:'POST', headers:{Accept:'application/json'} });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || '삭제에 실패했습니다.');
        location.reload();
    } catch(error) { alert(error.message); button.disabled = false; }
}));
const input = document.querySelector('[data-photo-form] input[type=file]');
let previews = [];
input?.addEventListener('change', () => {
    previews.forEach(URL.revokeObjectURL); previews = [];
    const container = document.querySelector('.club-photo-preview'); container.replaceChildren();
    const files = [...input.files];
    if(files.length > 10 || files.some(f => f.size > 5*1024*1024)) { input.value=''; alert('사진은 최대 10장, 장당 5MB까지 선택해주세요.'); return; }
    files.forEach(file => { const image = new Image(); const url = URL.createObjectURL(file); previews.push(url); image.src=url; image.alt='선택한 사진 미리보기'; container.append(image); });
});
const photos = [...document.querySelectorAll('#panel-album [data-photo-index] img')];
const dialog = document.getElementById('club-photo-dialog');
let selected = 0;
function show(index) {
    if(!photos.length) return;
    selected = (index + photos.length) % photos.length;
    dialog.querySelector('img').src=photos[selected].src;
    dialog.querySelector('img').alt=photos[selected].alt;
    dialog.querySelector('p').textContent=`${selected+1} / ${photos.length} · ${photos[selected].alt}`;
    if(!dialog.open) dialog.showModal();
}
document.querySelectorAll('[data-photo-index]').forEach(button=>button.addEventListener('click',()=>show(Number(button.dataset.photoIndex))));
dialog.querySelector('[data-photo-close]').addEventListener('click',()=>dialog.close());
dialog.querySelector('[data-photo-prev]').addEventListener('click',()=>show(selected-1));
dialog.querySelector('[data-photo-next]').addEventListener('click',()=>show(selected+1));
dialog.addEventListener('keydown',event=>{ if(event.key==='ArrowLeft')show(selected-1); if(event.key==='ArrowRight')show(selected+1); });
