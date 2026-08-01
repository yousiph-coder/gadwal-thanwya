// Canvas background particle animation (math / science)
(function() {
  let canvas, ctx;
  let particles = [], animFrame, currentTheme = null;

  function resizeCanvas(){
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }

  function mkMathParticle(){
    const shapes = ['triangle','circle','square','pentagon','line'];
    return {
      type: 'math',
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      x: Math.random() * (canvas ? canvas.width : 800),
      y: Math.random() * (canvas ? canvas.height : 600),
      vx: (Math.random() - .5) * .4,
      vy: (Math.random() - .5) * .4,
      size: 10 + Math.random() * 30,
      opacity: 0.04 + Math.random() * 0.1,
      color: ['#3b82f6','#60a5fa','#a78bfa','#818cf8'][Math.floor(Math.random() * 4)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - .5) * .01,
      label: ['π','∑','∫','∞','Δ','θ','λ','√'][Math.floor(Math.random() * 8)]
    };
  }

  function mkSciParticle(){
    const types = ['atom','hexagon','helix','leaf'];
    return {
      type: 'sci',
      shape: types[Math.floor(Math.random() * types.length)],
      x: Math.random() * (canvas ? canvas.width : 800),
      y: Math.random() * (canvas ? canvas.height : 600),
      vx: (Math.random() - .5) * .35,
      vy: (Math.random() - .5) * .35,
      size: 8 + Math.random() * 25,
      opacity: 0.04 + Math.random() * 0.09,
      color: ['#22c55e','#4ade80','#14b8a6','#86efac'][Math.floor(Math.random() * 4)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - .5) * .008,
      label: ['H₂O','CH₄','CO₂','O₂','NH₃','C₆H₆'][Math.floor(Math.random() * 6)]
    };
  }

  function drawMath(p){
    if (!ctx) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if(p.shape === 'triangle'){
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * .87, p.size * .5);
      ctx.lineTo(-p.size * .87, p.size * .5);
      ctx.closePath();
      ctx.stroke();
    } else if(p.shape === 'circle'){
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, p.size * .5, 0, Math.PI * 2);
      ctx.stroke();
    } else if(p.shape === 'square'){
      ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
    } else if(p.shape === 'pentagon'){
      for(let i = 0; i < 5; i++){
        ctx.lineTo(p.size * Math.cos(i * Math.PI * 2 / 5 - Math.PI / 2), p.size * Math.sin(i * Math.PI * 2 / 5 - Math.PI / 2));
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.moveTo(-p.size, 0);
      ctx.lineTo(p.size, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -p.size * .3);
      ctx.lineTo(0, p.size * .3);
      ctx.stroke();
    }
    ctx.fillStyle = p.color;
    ctx.font = `${p.size * .7}px serif`;
    ctx.globalAlpha = p.opacity * .8;
    ctx.fillText(p.label, p.size + 4, -p.size * .4);
    ctx.restore();
  }

  function drawSci(p){
    if (!ctx) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.3;
    if(p.shape === 'atom'){
      ctx.beginPath();
      ctx.arc(0, 0, p.size * .3, 0, Math.PI * 2);
      ctx.stroke();
      for(let i = 0; i < 3; i++){
        ctx.save();
        ctx.rotate(i * Math.PI / 3);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * .35, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    } else if(p.shape === 'hexagon'){
      ctx.beginPath();
      for(let i = 0; i < 6; i++){
        ctx.lineTo(p.size * Math.cos(i * Math.PI / 3), p.size * Math.sin(i * Math.PI / 3));
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, p.size * .45, 0, Math.PI * 2);
      ctx.stroke();
    } else if(p.shape === 'helix'){
      ctx.beginPath();
      for(let t = 0; t < Math.PI * 4; t += .1){
        const x = p.size * .5 * Math.cos(t);
        const y = t / (Math.PI * 4) * p.size * 1.5 - p.size * .75;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      for(let t = 0; t < Math.PI * 4; t += .1){
        const x = -p.size * .5 * Math.cos(t);
        const y = t / (Math.PI * 4) * p.size * 1.5 - p.size * .75;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * .5, p.size, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(0, p.size);
      ctx.stroke();
    }
    ctx.fillStyle = p.color;
    ctx.font = `${p.size * .55}px sans-serif`;
    ctx.globalAlpha = p.opacity * .7;
    ctx.fillText(p.label, p.size + 3, -p.size * .3);
    ctx.restore();
  }

  function animateParticles(){
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotV;
      if(p.x < -80) p.x = canvas.width + 80;
      if(p.x > canvas.width + 80) p.x = -80;
      if(p.y < -80) p.y = canvas.height + 80;
      if(p.y > canvas.height + 80) p.y = -80;
      currentTheme === 'math' ? drawMath(p) : drawSci(p);
    });
    animFrame = requestAnimationFrame(animateParticles);
  }

  function initTheme(branch){
    canvas = document.getElementById('themedCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    currentTheme = branch;
    cancelAnimationFrame(animFrame);
    resizeCanvas();
    const count = Math.min(50, Math.floor(canvas.width * canvas.height / 20000));
    particles = Array.from({length: count}, () => branch === 'math' ? mkMathParticle() : mkSciParticle());
    canvas.classList.add('visible');
    const isDay = document.body.classList.contains('day-mode');
    
    const b1 = document.getElementById('blob1');
    const b2 = document.getElementById('blob2');
    const b3 = document.getElementById('blob3');
    
    if(branch === 'math'){
      if (b1) b1.style.background = isDay ? '#bfdbfe' : '#3b6ef8';
      if (b2) b2.style.background = isDay ? '#ddd6fe' : '#6366f1';
      if (b3) b3.style.background = isDay ? '#bae6fd' : '#0ea5e9';
    } else {
      if (b1) b1.style.background = isDay ? '#bbf7d0' : '#16a34a';
      if (b2) b2.style.background = isDay ? '#99f6e4' : '#0d9488';
      if (b3) b3.style.background = isDay ? '#d9f99d' : '#84cc16';
    }
    animateParticles();
  }

  // Expose to window
  window.initTheme = initTheme;

  window.addEventListener('resize', () => {
    resizeCanvas();
    if(currentTheme) initTheme(currentTheme);
  });

  // Check on load
  document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('themedCanvas');
    if (canvas) {
      ctx = canvas.getContext('2d');
      resizeCanvas();
    }
  });
})();
