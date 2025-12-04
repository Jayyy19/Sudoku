// Pure JS Sudoku app: solver, validator, generator, UI interactions.
// No external libs. Single-file logic for portability.

(() => {
  const grid = document.getElementById('sudoku-grid');
  const statusEl = document.getElementById('status');
  const difficultyEl = document.getElementById('difficulty');
  const pencilToggle = document.getElementById('pencilToggle');
  const themeToggle = document.getElementById('themeToggle');
  const newGameBtn = document.getElementById('new-game');
  const solveBtn = document.getElementById('solve');
  const checkBtn = document.getElementById('check');

  // State
  let puzzle = [];
  let solution = [];
  let gridState = newGrid();
  let fixed = createMatrix(false);
  let notes = createNotes(); // Set of numbers per cell
  let selected = { r: 0, c: 0 };
  let undoStack = [], redoStack = [];
  let animating = false;

  // Utils
  function newGrid() { return Array.from({length:9}, () => Array(9).fill(0)); }
  function createMatrix(val) { return Array.from({length:9}, () => Array(9).fill(val)); }
  function createNotes() { return Array.from({length:9}, () => Array.from({length:9}, () => new Set())); }
  function cloneState(){ return { grid: gridState.map(r=>r.slice()), fixed: fixed.map(r=>r.slice()), notes: notes.map(row=>row.map(s=>new Set([...s]))) } }
  function pushUndo(){ undoStack.push(cloneState()); if(undoStack.length>200) undoStack.shift(); redoStack=[]; }
  function setStatus(txt, cls="") { statusEl.textContent = txt; statusEl.className = cls; }

  // Validator: returns conflicts set of "r,c" strings
  function validate(g){
    let conflicts = new Set();
    // rows
    for(let r=0;r<9;r++){
      let seen = {};
      for(let c=0;c<9;c++){
        let v = g[r][c];
        if(!v) continue;
        if(seen[v]) { conflicts.add(`${r},${c}`); conflicts.add(`${r},${seen[v]}`); }
        else seen[v]=c;
      }
    }
    // cols
    for(let c=0;c<9;c++){
      let seen = {};
      for(let r=0;r<9;r++){
        let v = g[r][c];
        if(!v) continue;
        if(seen[v]) { conflicts.add(`${r},${c}`); conflicts.add(`${seen[v]},${c}`); }
        else seen[v]=r;
      }
    }
    // blocks
    for(let br=0;br<9;br+=3){
      for(let bc=0;bc<9;bc+=3){
        let seen = {};
        for(let r=br;r<br+3;r++){
          for(let c=bc;c<bc+3;c++){
            let v = g[r][c];
            if(!v) continue;
            if(seen[v]) { conflicts.add(`${r},${c}`); conflicts.add(`${seen[v][0]},${seen[v][1]}`); }
            else seen[v]=[r,c];
          }
        }
      }
    }
    return conflicts;
  }

  // Solver (backtracking) with optional step recording and solution counting
  function solverClone(gIn){
    // create solver object encapsulating helper methods
    const g = gIn.map(r=>r.slice());
    function findEmpty(){
      for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(g[r][c]===0) return [r,c];
      return null;
    }
    function valid(r,c,val){
      for(let i=0;i<9;i++){ if(g[r][i]===val) return false; if(g[i][c]===val) return false; }
      const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
      for(let i=br;i<br+3;i++) for(let j=bc;j<bc+3;j++) if(g[i][j]===val) return false;
      return true;
    }
    return { g, findEmpty, valid };
  }

  function solveSync(gIn){
    // returns solved grid or null
    const s = solverClone(gIn);
    let solved = false;
    function backtrack(){
      const pos = s.findEmpty();
      if(!pos){ solved=true; return true; }
      const [r,c] = pos;
      for(let val=1; val<=9; val++){
        if(s.valid(r,c,val)){
          s.g[r][c]=val;
          if(backtrack()) return true;
          s.g[r][c]=0;
        }
      }
      return false;
    }
    backtrack();
    return solved ? s.g : null;
  }

  function solveWithSteps(gIn, limit=1){
    // returns {solutionsFound, steps} steps: snapshots of grid after assignments/backtracks
    const s = solverClone(gIn);
    let solutions = 0;
    const steps = [];
    function backtrack(){
      if(solutions >= limit) return;
      const pos = s.findEmpty();
      if(!pos){ solutions++; steps.push(s.g.map(r=>r.slice())); return; }
      const [r,c] = pos;
      for(let val=1; val<=9; val++){
        if(s.valid(r,c,val)){
          s.g[r][c]=val;
          steps.push(s.g.map(r=>r.slice()));
          backtrack();
          if(solutions >= limit) return;
          s.g[r][c]=0;
          steps.push(s.g.map(r=>r.slice()));
        }
      }
    }
    backtrack();
    return { solutionsFound: solutions, steps };
  }

  function countSolutions(gIn, limit=2){
    const s = solverClone(gIn);
    let count = 0;
    function backtrack(){
      if(count >= limit) return;
      const pos = s.findEmpty();
      if(!pos){ count++; return; }
      const [r,c] = pos;
      for(let val=1; val<=9; val++){
        if(s.valid(r,c,val)){
          s.g[r][c]=val;
          backtrack();
          if(count >= limit){ s.g[r][c]=0; return; }
          s.g[r][c]=0;
        }
      }
    }
    backtrack();
    return count;
  }

  // Generator: produce full, then remove while keeping unique solution
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]] } }
  function generateFull(){
    const g = newGrid();
    const s = solverClone(g);
    function backtrack(){
      const pos = s.findEmpty();
      if(!pos) return true;
      const [r,c] = pos;
      const nums = [1,2,3,4,5,6,7,8,9]; shuffle(nums);
      for(const val of nums){
        if(s.valid(r,c,val)){
          s.g[r][c]=val;
          if(backtrack()) return true;
          s.g[r][c]=0;
        }
      }
      return false;
    }
    backtrack();
    return s.g;
  }

  const BASE_FILLED = { easy:40, medium:32, hard:26, expert:22 };

  function generatePuzzle(difficulty='easy'){
    const target = BASE_FILLED[difficulty] || 36;
    const full = generateFull();
    const cells = [];
    for(let r=0;r<9;r++) for(let c=0;c<9;c++) cells.push([r,c]);
    shuffle(cells);
    const puzzle = full.map(r=>r.slice());
    let filled = 81;
    for(const [r,c] of cells){
      if(filled <= target) break;
      const backup = puzzle[r][c];
      puzzle[r][c]=0;
      const ct = countSolutions(puzzle, 2);
      if(ct !== 1){ puzzle[r][c]=backup; } else { filled--; }
    }
    return puzzle;
  }

  // UI rendering
  function render(){
    grid.innerHTML = '';
    const conflicts = validate(gridState);
    for(let r=0;r<9;r++){
      for(let c=0;c<9;c++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        if((c+1)%3===0 && c!==8) cell.classList.add('block-right');
        if((r+1)%3===0 && r!==8) cell.classList.add('block-bottom');
        if(fixed[r][c]) cell.classList.add('fixed');
        if(selected.r===r && selected.c===c) cell.classList.add('selected');
        if(conflicts.has(`${r},${c}`)) cell.classList.add('conflict');
        cell.dataset.r = r; cell.dataset.c = c;
        const val = gridState[r][c];
        if(val !== 0){
          cell.textContent = val;
        } else if(notes[r][c].size > 0){
          const notesBox = document.createElement('div');
          notesBox.className = 'notes';
          for(let n=1;n<=9;n++){
            const nspan = document.createElement('div');
            if(notes[r][c].has(n)) nspan.classList.add('selected-note');
            nspan.textContent = notes[r][c].has(n) ? n : '';
            notesBox.appendChild(nspan);
          }
          cell.appendChild(notesBox);
        }
        cell.addEventListener('click', ()=>{ if(animating) return; selected = {r,c}; render(); });
        grid.appendChild(cell);
      }
    }
    const valid = conflicts.size===0;
    setStatus(valid ? 'Valid grid' : 'Conflicts found', valid ? 'status-ok' : 'status-bad');
  }

  // Input handlers
  function setCell(r,c,val, markFixed=false){
    if(fixed[r][c]) return;
    pushUndo();
    gridState[r][c] = val;
    if(markFixed) fixed[r][c]=true;
    render();
  }

  function toggleNote(r,c,n){
    if(fixed[r][c]) return;
    pushUndo();
    if(notes[r][c].has(n)) notes[r][c].delete(n);
    else notes[r][c].add(n);
    render();
  }

  // Keyboard and UI wiring
  window.addEventListener('keydown', (e)=>{
    if(animating) return;
    if(e.ctrlKey && e.key.toLowerCase()==='z'){ // undo
      if(undoStack.length){ redoStack.push(cloneState()); const s = undoStack.pop(); applyState(s); }
      e.preventDefault(); return;
    }
    if((e.ctrlKey && e.key.toLowerCase()==='y') || (e.ctrlKey && e.key.toLowerCase()==='shift' && e.key.toLowerCase()==='z')){ // redo
      if(redoStack.length){ undoStack.push(cloneState()); const s = redoStack.pop(); applyState(s); }
      e.preventDefault(); return;
    }
    if(e.key==='ArrowUp'){ selected.r = (selected.r+8)%9; render(); e.preventDefault(); return; }
    if(e.key==='ArrowDown'){ selected.r = (selected.r+1)%9; render(); e.preventDefault(); return; }
    if(e.key==='ArrowLeft'){ selected.c = (selected.c+8)%9; render(); e.preventDefault(); return; }
    if(e.key==='ArrowRight'){ selected.c = (selected.c+1)%9; render(); e.preventDefault(); return; }
    if(/^[1-9]$/.test(e.key)){
      const n = Number(e.key);
      if(pencilToggle.checked){ toggleNote(selected.r, selected.c, n); } else { setCell(selected.r, selected.c, n); notes[selected.r][selected.c].clear(); }
      return;
    }
    if(e.key==='Backspace' || e.key==='Delete'){ setCell(selected.r, selected.c, 0); notes[selected.r][selected.c].clear(); return; }
    if(e.key.toLowerCase()==='g'){ document.getElementById('generate').click(); return; }
    if(e.key.toLowerCase()==='s'){
      if(e.shiftKey) document.getElementById('stepSolve').click(); else document.getElementById('solve').click();
      return;
    }
  });

  // Button wiring
  document.getElementById('generate').addEventListener('click', ()=>{
    if(animating) return;
    pushUndo();
    const diff = difficultyEl.value;
    setStatus('Generating...', '');
    setTimeout(()=>{ // allow UI update
      gridState = generatePuzzle(diff);
      fixed = gridState.map(r=>r.map(v=>v!==0));
      notes = createNotes();
      setStatus('Puzzle generated', '');
      render();
    }, 30);
  });

  document.getElementById('clear').addEventListener('click', ()=>{
    if(animating) return;
    pushUndo();
    gridState = newGrid();
    fixed = createMatrix(false);
    notes = createNotes();
    render();
  });

  document.getElementById('validate').addEventListener('click', ()=>{
    const conflicts = validate(gridState);
    if(conflicts.size===0) setStatus('Grid valid', 'status-ok'); else setStatus('Conflicts found', 'status-bad');
    render();
  });

  document.getElementById('solve').addEventListener('click', ()=>{
    if(animating) return;
    pushUndo();
    setStatus('Solving...', '');
    setTimeout(()=>{
      const sol = solveSync(gridState.map(r=>r.slice()));
      if(!sol){ setStatus('No solution', 'status-bad'); return; }
      gridState = sol;
      fixed = gridState.map(r=>r.map(v=>false));
      notes = createNotes();
      setStatus('Solved', 'status-ok');
      render();
    }, 20);
  });

  document.getElementById('stepSolve').addEventListener('click', async ()=>{
    if(animating) return;
    pushUndo();
    setStatus('Computing steps...', '');
    animating = true;
    await new Promise(r => setTimeout(r, 20));
    const res = solveWithSteps(gridState.map(r=>r.slice()), 1);
    if(res.steps.length===0){ setStatus('No solution', 'status-bad'); animating=false; return; }
    for(const step of res.steps){
      gridState = step.map(r=>r.slice());
      render();
      await new Promise(r => setTimeout(r, 50));
    }
    setStatus('Step-by-step finished', 'status-ok');
    animating = false;
  });

  document.getElementById('undo').addEventListener('click', ()=>{
    if(undoStack.length){ redoStack.push(cloneState()); const s = undoStack.pop(); applyState(s); }
  });
  document.getElementById('redo').addEventListener('click', ()=>{
    if(redoStack.length){ undoStack.push(cloneState()); const s = redoStack.pop(); applyState(s); }
  });

  document.getElementById('erase').addEventListener('click', ()=>{ setCell(selected.r, selected.c, 0); notes[selected.r][selected.c].clear(); });
  document.querySelectorAll('.numpad button[data-num]').forEach(b => b.addEventListener('click', ()=>{
    const n = Number(b.dataset.num);
    if(pencilToggle.checked) toggleNote(selected.r, selected.c, n); else setCell(selected.r, selected.c, n);
  }));

  // Theme toggle
  themeToggle.addEventListener('click', (e)=>{
    document.body.classList.toggle('dark');
    e.target.textContent = document.body.classList.contains('dark') ? 'Light' : 'Dark';
  });

  // State apply/restore
  function applyState(s){
    gridState = s.grid.map(r=>r.slice());
    fixed = s.fixed.map(r=>r.slice());
    notes = s.notes.map(row=>row.map(set=>new Set([...set])));
    render();
  }

  // Initial render
  render();
  setStatus('Ready', '');

  // Expose some functions for console debugging (optional)
  window.sudoku = { grid, generatePuzzle, solveSync, countSolutions, validate };

  // Sudoku game logic
  function generatePuzzle() {
    const board = Array(9).fill().map(() => Array(9).fill(0));

    function isValid(b, row, col, num) {
      for (let i = 0; i < 9; i++) {
        if (b[row][i] === num || b[i][col] === num) return false;
      }
      const boxRow = Math.floor(row / 3) * 3;
      const boxCol = Math.floor(col / 3) * 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (b[boxRow + i][boxCol + j] === num) return false;
        }
      }
      return true;
    }

    function solve(b) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (b[row][col] === 0) {
            for (let num = 1; num <= 9; num++) {
              if (isValid(b, row, col, num)) {
                b[row][col] = num;
                if (solve(b)) return true;
                b[row][col] = 0;
              }
            }
            return false;
          }
        }
      }
      return true;
    }

    solve(board);
    solution = board.map(row => [...row]);
    puzzle = board.map(row => [...row]);

    for (let i = 0; i < 40; i++) {
      const row = Math.floor(Math.random() * 9);
      const col = Math.floor(Math.random() * 9);
      puzzle[row][col] = 0;
    }
  }

  function renderGrid() {
    grid.innerHTML = '';
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (puzzle[row][col] !== 0) {
          cell.textContent = puzzle[row][col];
          cell.classList.add('fixed');
        } else {
          cell.contentEditable = true;
          cell.addEventListener('input', (e) => {
            const value = parseInt(e.target.textContent) || 0;
            if (value < 1 || value > 9) {
              e.target.textContent = '';
              cell.classList.add('error');
              setTimeout(() => cell.classList.remove('error'), 500);
            } else {
              puzzle[row][col] = value;
            }
          });
        }
        grid.appendChild(cell);
      }
    }
  }

  function checkPuzzle() {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (puzzle[row][col] !== solution[row][col]) {
          alert('Not quite right. Keep trying!');
          document.body.style.background = 'linear-gradient(45deg, #ff9a9e, #fecfef)';
          return;
        }
      }
    }
    alert('Congratulations! You solved it!');
    document.body.style.background = 'linear-gradient(45deg, #a8e6cf, #dcedc8, #ffd3a5)';
  }

  function solvePuzzle() {
    puzzle = solution.map(row => [...row]);
    renderGrid();
  }

  newGameBtn.addEventListener('click', () => {
    generatePuzzle();
    renderGrid();
    document.body.style.background = 'linear-gradient(45deg, #ff9a9e, #fecfef, #a8edea, #fed6e3)';
  });

  solveBtn.addEventListener('click', solvePuzzle);
  checkBtn.addEventListener('click', checkPuzzle);

  generatePuzzle();
  renderGrid();
})();