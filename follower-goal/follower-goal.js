const textArea = document.querySelector('#text');

let followers = 0;

function updateFollowerGoal(nr){
  textArea.innerHTML = `${nr}/1k`;
  
  const progress = (parseInt(nr) / 1000) * 100;

  textArea.style.background = `linear-gradient(to right, 
    rgba(70, 67, 133, 1) ${progress}%, 
    rgba(28, 27, 53, 1) ${progress}%
  )`;
}

async function fetchFollowers() {
  console.log('it wasnt me');
  const response = await fetch('http://localhost:8082/follower-goal');
  const data = await response.text();
  if(data && data !== followers){
    updateFollowerGoal(data);
    followers = data;
  }
};


fetchFollowers();

setInterval(fetchFollowers, 5 * 60 * 1000)
