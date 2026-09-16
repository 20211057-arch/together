(function () {
  const INITIAL_SIZE = 3;
  const PAGE_SIZE = 10;

  const allReviews = window.__ALL_REVIEWS__ || [];
  let renderedCount = 0;

  const listEl = document.getElementById('reviewList');
  const moreBtn = document.getElementById('reviewMoreBtn');

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderReviewCard(review) {
    const filled = '★'.repeat(review.rating);
    const empty = '★'.repeat(5 - review.rating);

    const avatarHtml = review.userImg
      ? `<img src="${escapeHtml(review.userImg)}" alt="">`
      : `<span class="review-avatar-icon">👤</span>`;

    const photosHtml = (review.images && review.images.length)
      ? `<div class="review-photos">
           ${review.images.map(img => `
             <div class="review-photo">
               <img src="${escapeHtml(img)}" alt="">
             </div>
           `).join('')}
         </div>`
      : '';

    return `
      <div class="review-card">
        <div class="review-head">
          <div class="review-avatar">${avatarHtml}</div>
          <div class="review-head-info">
            <div class="review-name">${escapeHtml(review.userName)}</div>
            <div class="review-rating-row">
              <span class="review-stars">${filled}<span class="review-stars-empty">${empty}</span></span>
              <span class="review-date">${escapeHtml(review.dateLabel)}</span>
            </div>
          </div>
        </div>
        ${photosHtml}
        <div class="review-text">${escapeHtml(review.content)}</div>
      </div>
    `;
  }

  function renderNextBatch(count) {
    const nextSlice = allReviews.slice(renderedCount, renderedCount + count);
    listEl.insertAdjacentHTML('beforeend', nextSlice.map(renderReviewCard).join(''));
    renderedCount += nextSlice.length;
    updateMoreBtn();
  }

  function updateMoreBtn() {
    moreBtn.style.display = renderedCount < allReviews.length ? 'flex' : 'none';
  }

  moreBtn.addEventListener('click', function () {
    renderNextBatch(PAGE_SIZE);
  });

  renderNextBatch(INITIAL_SIZE);
})();