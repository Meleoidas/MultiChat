const textArea = document.querySelector('#text');

function updateNewestFollower(name){
  textArea.innerHTML = `Newest Follower: ${name}`;
}

let followers = new Set();
setInterval(async () => {
  const response = await fetch('http://localhost:8082/newest-follower');
  const data = await response.text();
  console.log(data);
  if(data) updateNewestFollower(data);
}, 3000);