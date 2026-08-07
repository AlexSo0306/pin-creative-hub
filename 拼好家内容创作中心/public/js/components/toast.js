let timer;

export function toast(message, tone = 'default') {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.dataset.tone = tone;
  element.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => element.classList.remove('show'), 2800);
}
