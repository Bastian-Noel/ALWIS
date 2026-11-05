// JavaScript sans bibliothèque : recherche locale et API PHP/MySQLi.
for (const input of document.querySelectorAll('[data-filter]')) {
  input.addEventListener('input', () => {
    const query = input.value.toLocaleLowerCase('fr');
    for (const row of document.querySelectorAll(`${input.dataset.filter} tbody tr`)) {
      row.hidden = !row.textContent.toLocaleLowerCase('fr').includes(query);
    }
  });
}
const summary = document.querySelector('#live-summary');
if (summary) {
  fetch('/api/summary.php', { credentials: 'same-origin' })
    .then(response => {
      if (!response.ok) throw new Error('Le bilan n’est pas disponible.');
      return response.json();
    })
    .then(data => { summary.textContent = `${data.unread} message(s) non lu(s)`; })
    .catch(() => { summary.textContent = 'Bilan indisponible · actualisez la page'; });
}
