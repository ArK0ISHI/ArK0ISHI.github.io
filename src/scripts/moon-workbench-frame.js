/* Enhances the original dashboard after its seven scripts have initialized. */
(() => {
  'use strict';
  if (document.documentElement.classList.contains('wb-enhanced')) return;
  const sidebar = document.querySelector('.sidebar');
  const navigation = sidebar?.querySelector('nav');
  const buttons = [...(navigation?.querySelectorAll('button[data-view]') || [])];
  if (!sidebar || !navigation || !buttons.length) return;
  const mobile = matchMedia('(max-width: 760px)');
  const labels = new Map(buttons.map((button) => {
    const clone = button.cloneNode(true);
    clone.querySelectorAll('[aria-hidden]').forEach((node) => node.remove());
    return [button.dataset.view, clone.textContent.trim()];
  }));
  const brand = sidebar.querySelector('.brand>span:last-child');
  if (brand) {
    brand.textContent = '分析目录';
    const caption = document.createElement('small');
    caption.textContent = `${buttons.length} 个视角 · 自由切换`;
    brand.append(caption);
  }
  const edition = sidebar.querySelector('.local-badge');
  if (edition) edition.textContent = '完整数据';
  navigation.id = 'wb-analysis-navigation';
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'wb-mobile-nav-toggle';
  menu.setAttribute('aria-controls', navigation.id);
  menu.setAttribute('aria-expanded', 'false');
  menu.innerHTML = '<span class="wb-mobile-nav-label">分析视图</span><span class="wb-mobile-current"></span><span class="wb-mobile-position"></span><i class="wb-disclosure-mark" aria-hidden="true"></i>';
  sidebar.prepend(menu);
  const currentLabel = menu.querySelector('.wb-mobile-current');
  const currentPosition = menu.querySelector('.wb-mobile-position');
  function setMenu(open, focus = false) {
    sidebar.classList.toggle('wb-nav-open', open);
    menu.setAttribute('aria-expanded', String(open));
    if (focus && mobile.matches) menu.focus({ preventScroll: true });
  }
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  navigation.addEventListener('click', (event) => {
    if (event.target.closest('button[data-view]') && mobile.matches) setMenu(false, true);
  });
  sidebar.addEventListener('focusout', (event) => {
    if (mobile.matches && event.relatedTarget && !sidebar.contains(event.relatedTarget)) setMenu(false);
  });
  sidebar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('wb-nav-open')) {
      event.preventDefault(); setMenu(false, true);
    }
  });
  document.addEventListener('click', (event) => {
    if (mobile.matches && !sidebar.contains(event.target)) setMenu(false);
  });

  const filters = document.getElementById('gpa-filters');
  let filterToggle;
  let filterSummary;
  if (filters) {
    filterToggle = document.createElement('button');
    filterToggle.type = 'button';
    filterToggle.className = 'wb-filter-toggle';
    filterToggle.setAttribute('aria-expanded', 'false');
    filterToggle.innerHTML = '<span class="wb-filter-copy"><span class="wb-filter-label">筛选范围</span><span class="wb-filter-summary"></span></span><i class="wb-disclosure-mark" aria-hidden="true"></i>';
    filters.prepend(filterToggle);
    filterSummary = filterToggle.querySelector('.wb-filter-summary');
    const controlled = [...filters.children].filter((child) => child !== filterToggle);
    controlled.forEach((child, index) => { child.id ||= `wb-filter-part-${index}`; });
    filterToggle.setAttribute('aria-controls', controlled.map((child) => child.id).join(' '));
    filterToggle.addEventListener('click', () => {
      const open = !filters.classList.contains('wb-filters-open');
      filters.classList.toggle('wb-filters-open', open);
      filterToggle.setAttribute('aria-expanded', String(open));
    });
    filters.addEventListener('change', updateFilterSummary);
    filters.addEventListener('click', () => queueMicrotask(updateFilterSummary));
  }
  function updateFilterSummary() {
    if (!filterSummary) return;
    const yearButtons = [...document.querySelectorAll('.year-toggle')];
    const years = yearButtons.filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent.trim());
    const yearText = years.length === yearButtons.length && years.length > 1 ? `${years[0]}—${years.at(-1)}级` : `${years.join('、')}级`;
    const college = document.getElementById('college');
    const major = document.getElementById('major');
    const scope = major?.value ? major.selectedOptions[0]?.textContent : college?.selectedOptions[0]?.textContent;
    const zero = document.getElementById('include-zero');
    filterSummary.textContent = [yearText, scope, zero && !zero.checked ? '不含系统 0' : ''].filter(Boolean).join(' · ');
  }
  let lastView;
  function syncView() {
    const active = navigation.querySelector('[aria-current="page"]') || navigation.querySelector('.active') || buttons[0];
    const view = active.dataset.view;
    currentLabel.textContent = labels.get(view) || '选择视图';
    currentPosition.textContent = `${String(buttons.indexOf(active) + 1).padStart(2, '0')} / ${buttons.length}`;
    menu.setAttribute('aria-label', `切换分析视图，当前为${labels.get(view) || '总绩点全景'}`);
    if (lastView && lastView !== view && mobile.matches) setMenu(false);
    lastView = view;
    updateFilterSummary();
  }
  const observer = new MutationObserver(syncView);
  observer.observe(navigation, { subtree: true, attributes: true, attributeFilter: ['aria-current', 'class'] });
  let lastFocused = document.activeElement;
  document.addEventListener('focusin', event => { lastFocused = event.target; });
  document.addEventListener('focusout', event => {
    if (!event.relatedTarget && event.target.getClientRects().length) lastFocused = null;
  });
  const scope = document.getElementById('scope');
  if (scope) new MutationObserver(updateFilterSummary).observe(scope, { childList: true, subtree: true, characterData: true });
  mobile.addEventListener('change', () => {
    // A responsive display:none can move focus to body before matchMedia fires.
    const active = document.activeElement === document.body ? lastFocused : document.activeElement;
    const navFocus = mobile.matches && navigation.contains(active);
    const filterFocus = mobile.matches && filters?.contains(active) && active !== filterToggle && !filters.classList.contains('wb-filters-open');
    setMenu(false, navFocus);
    if (filterFocus) filterToggle?.focus({ preventScroll: true });
    if (!mobile.matches && active === menu) navigation.querySelector('.active')?.focus({ preventScroll: true });
    if (!mobile.matches && active === filterToggle) filters?.querySelector('.year-toggle, select')?.focus({ preventScroll: true });
  });
  document.documentElement.classList.add('wb-enhanced');
  syncView();
})();
