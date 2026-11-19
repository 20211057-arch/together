export function bindMeetingSearch(id, onSearch) {
  const form = document.getElementById(id);
  if (!form) return;
  const input = form.querySelector('input');
  const submit = form.querySelector('[type="submit"]');
  const status = form.querySelector('.meeting-search-status');
  let requestId = 0;

  async function search() {
    const current = ++requestId;
    const q = input.value.trim();
    submit.disabled = true;
    status.textContent = q ? '모임을 찾고 있어요…' : '';
    try {
      if (current !== requestId) return;
      const notice = await onSearch(q);
      if (current === requestId) status.textContent = q ? `‘${q}’ 검색 결과${notice ? ` · ${notice}` : ''}` : '';
    } catch (error) {
      if (current === requestId) status.textContent = error.message;
    } finally {
      if (current === requestId) submit.disabled = false;
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); search(); });
  form.querySelectorAll('[data-search-example]').forEach(button => {
    button.addEventListener('click', () => { input.value = button.dataset.searchExample; search(); });
  });
  input.addEventListener('input', () => { if (!input.value.trim()) search(); });
  return () => { ++requestId; input.value = ''; status.textContent = ''; submit.disabled = false; };
}

export function matchesInstantSearch(crew, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const text = [crew.title, crew.intro, crew.state, crew.city, crew.detail, crew.sport, crew.sportKr].join(' ').toLowerCase();
  return words.every(word => text.includes(word));
}
