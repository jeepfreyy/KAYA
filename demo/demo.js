document.getElementById('workshop-form').addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('confirmation').textContent = 'Practice complete. Nothing was submitted or saved. You can edit the form and try Kaya Mode again.';
});
