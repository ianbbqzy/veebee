document.getElementById('playButton').addEventListener('click', () => {
  const audioElement = document.getElementById('pronunciation');
  audioElement.play();
});

chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req.message === 'translation') {
    document.getElementById('translation').textContent = req.translation;
    document.getElementById('pronunciation').src = 'data:audio/mp3;base64,' + req.pronunciation;
  }
});