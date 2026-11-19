import { bindMeetingSearch } from './modules/meetingSearch.js';

(() => {
  const section = document.querySelector('.latest-crews');
  if (!section) return;
  const grid = section.querySelector('.latest-grid');
  const loader = section.querySelector('.latest-load-more');
  const status = section.querySelector('.latest-load-status');
  const button = section.querySelector('.latest-load-button');
  const mobile = matchMedia('(max-width: 768px)');
  const fallbackImage = section.dataset.fallbackImage;
  let cursor = section.dataset.nextCursor;
  let loading = false;
  let failed = false;
  let keyword = '';
  let generation = 0;
  const heading = section.querySelector('.latest-heading h2');
  const empty = section.querySelector('.latest-empty');

  bindMeetingSearch('home-search', async query => {
    const request = ++generation;
    const previousKeyword = keyword;
    keyword = query;
    loading = true;
    button.disabled = true;
    try {
      const response = await fetch(`/api/latest-meetings?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('검색 결과를 불러오지 못했어요.');
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.meetings)) throw new Error('검색 결과를 불러오지 못했어요.');
      if (request !== generation) return;
      grid.replaceChildren(...data.meetings.map(createCard));
      heading.textContent = query ? '모임 검색 결과' : '최근에 만들어진 모임';
      empty.hidden = data.meetings.length > 0;
      empty.textContent = query ? '조건에 맞는 모임이 없어요. 다른 검색어를 입력해주세요.' : '아직 등록된 모임이 없어요.';
      cursor = data.nextCursor;
      loader.hidden = !cursor;
      button.hidden = !cursor;
      button.textContent = '모임 더 보기';
      status.textContent = '';
      failed = false;
    } catch (error) {
      if (request === generation) { keyword = previousKeyword; failed = true; throw error; }
    } finally {
      if (request === generation) { loading = false; button.disabled = false; }
    }
  });

  function replaceBrokenImage(image) {
    if (image.getAttribute('src') !== fallbackImage) image.src = fallbackImage;
  }

  grid.addEventListener('error', event => {
    if (event.target.matches('.latest-thumbnail')) replaceBrokenImage(event.target);
  }, true);
  
  grid.querySelectorAll('.latest-thumbnail').forEach(image => {
    if (image.complete && !image.naturalWidth) replaceBrokenImage(image);
  });

  function createCard(meeting) {
    const card = document.createElement('a');
    card.className = 'latest-card';
    card.href = `/regular/list/${encodeURIComponent(meeting.id)}`;
    const image = document.createElement('img');
    image.className = 'latest-thumbnail';
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = meeting.profileImage?.trim() || fallbackImage;
    card.append(image);
    const add = (parent, tag, text, className) => {
      const element = document.createElement(tag);
      element.textContent = text;
      if (className) element.className = className;
      parent.append(element);
      return element;
    };
    add(card, 'span', `${meeting.emoji} ${meeting.sportLabel}`, 'latest-sport');
    add(card, 'h3', meeting.title);
    add(card, 'p', meeting.district);
    add(card, 'div', `${meeting.schedule} · ${meeting.level}`);
    const footer = add(card, 'footer', '');
    add(footer, 'span', `${meeting.current} / ${meeting.total}명`);
    add(footer, 'span', meeting.pillLabel);
    return card;
  }

  async function loadMore() {
    if ((mobile.matches && !keyword) || loading || !cursor) return;
    loading = true;
    const request = generation;
    failed = false;
    button.disabled = true;
    status.textContent = '모임을 불러오는 중…';
    try {
      const response = await fetch(`/api/latest-meetings?cursor=${encodeURIComponent(cursor)}&q=${encodeURIComponent(keyword)}`);
      if (!response.ok) throw new Error('Request failed');
      const data = await response.json();
      if (!data.ok || !Array.isArray(data.meetings)) throw new Error('Invalid response');
      if (request !== generation) return;
      grid.append(...data.meetings.map(createCard));
      cursor = data.nextCursor;
      status.textContent = cursor ? '' : '모든 모임을 확인했어요.';
      button.hidden = !cursor;
    } catch {
      if (request !== generation) return;
      failed = true;
      status.textContent = '모임을 불러오지 못했어요. 다시 시도해 주세요.';
      button.textContent = '다시 시도';
    } finally {
      if (request !== generation) return;
      loading = false;
      button.disabled = false;
      if (!failed) checkVisible();
    }
  }

  // Check again after appending: the loader may still fit in a tall viewport.
  function checkVisible() {
    if (mobile.matches || failed || !cursor || loading) return;
    const bounds = loader.getBoundingClientRect();
    const root = document.querySelector('body > .main').getBoundingClientRect();
    if (bounds.top < root.bottom + 200 && bounds.bottom > root.top) loadMore();
  }

  button.addEventListener('click', loadMore);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !failed) loadMore();
    }, { root: document.querySelector('body > .main'), rootMargin: '200px' });
    observer.observe(loader);
  }
  mobile.addEventListener('change', checkVisible);
  checkVisible();
})();
