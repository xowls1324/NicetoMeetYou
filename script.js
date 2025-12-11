// ============ 1. Groq API 키 ============
const GROQ_API_KEY = "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";

// ============ 2. DOM 요소 ============
const pdfInput = document.getElementById("pdfInput");
const generateBtn = document.getElementById("generateQuizBtn");
const moreQuizBtn = document.getElementById("moreQuizBtn");
const retryQuizBtn = document.getElementById("retryQuizBtn");
const statusDiv = document.getElementById("status");
const hudDiv = document.getElementById("hud");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ============ 3. 상태 변수 ============
let lectureText = "";
let questions = [];
let originalQuestions = []; // 다시 풀어보기용
let currentQuestionIndex = 0;
let score = 0;

let player = {
  x: canvas.width / 2 - 25,
  y: canvas.height - 60,
  width: 50,
  height: 20,
  speed: 7,
};

let choices = [];
let keys = {};
let gameRunning = false;

// ○ / X 피드백
let feedback = {
  active: false,
  isCorrect: false,
  timer: 0,
  duration: 400 // ms
};

// ============ 4. 키보드 입력 ============
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
});

window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

// ============ 5. PDF 업로드 -> 텍스트 추출 ============
pdfInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  statusDiv.textContent = "PDF 읽는 중...";

  const reader = new FileReader();
  reader.onload = async function () {
    const typedArray = new Uint8Array(this.result);

    const loadingTask = pdfjsLib.getDocument({ data: typedArray });
    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const strings = textContent.items.map((item) => item.str);
      fullText += strings.join(" ") + "\n";
    }

    lectureText = fullText;
    statusDiv.textContent =
      "PDF 텍스트 추출 완료! 길이: " + lectureText.length + " 글자";
  };

  reader.readAsArrayBuffer(file);
});

// ============ 6. Groq로 퀴즈 생성 ============
async function generateQuizFromText(text) {
  const trimmed = text.slice(0, 6000);

  const prompt = `
다음은 대학 강의 자료의 내용 일부입니다.

---
${trimmed}
---

위 내용을 바탕으로, 중요한 개념을 중심으로 한 4지선다 객관식 퀴즈 10문제를 한국어로 만들어 주세요.

조건:
- 각 문제는 하나의 핵심 개념만 다루는 간단한 문장으로.
- 보기(options)는 각 항목이 15자 이내의 짧은 구/단어로.
- 너무 긴 문장형 보기, 설명문, 예시는 피하고, 간단한 용어/개념 위주로.

반드시 아래 JSON 형식의 배열만 출력하세요. 설명 문장은 쓰지 마세요.

[
  {
    "question": "문제 내용",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answerIndex": 0
  }
]

주의사항:
- question은 한국어 문장.
- options는 길이 4인 문자열 배열.
- answerIndex는 0,1,2,3 중 정답의 인덱스 숫자.
- JSON 이외의 다른 텍스트는 출력하지 마세요.
`;

  const url = "https://api.groq.com/openai/v1/chat/completions";

  const body = {
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error("Groq API 오류: " + (await response.text()));
  }

  const data = await response.json();
  const textResponse = data.choices?.[0]?.message?.content ?? "";

  let quizArray;
  try {
    quizArray = JSON.parse(textResponse);
  } catch (e) {
    console.error("JSON 파싱 실패:", textResponse);
    throw new Error("퀴즈 JSON 파싱에 실패했습니다.");
  }

  return quizArray;
}

// ============ 7. 버튼 핸들러 ============

// 기본 퀴즈 생성
generateBtn.addEventListener("click", async () => {
  if (!lectureText) {
    statusDiv.textContent = "먼저 PDF를 업로드해주세요.";
    return;
  }

  statusDiv.textContent =
    "LLM으로 퀴즈 생성 중... (잠시만 기다려주세요)";

  try {
    const quizArray = await generateQuizFromText(lectureText);
    questions = quizArray;
    // 다시 풀어보기용으로 깊은 복사
    originalQuestions = JSON.parse(JSON.stringify(quizArray));
    statusDiv.textContent =
      "퀴즈 생성 완료! 문제 수: " + questions.length;
    startGame();
  } catch (err) {
    console.error(err);
    statusDiv.textContent =
      "퀴즈 생성 중 오류 발생: " + err.message;
  }
});

// moreQuizBtn.addEventListener("click", ...) 중간부터 다시 정리

moreQuizBtn.addEventListener("click", async () => {
  if (!lectureText) {
    statusDiv.textContent = "먼저 PDF를 업로드해주세요.";
    return;
  }

  statusDiv.textContent =
    "새로운 퀴즈 세트 생성 중... (잠시만 기다려주세요)";

  try {
    const quizArray = await generateQuizFromText(lectureText);
    questions = quizArray;
    originalQuestions = JSON.parse(JSON.stringify(quizArray));
    statusDiv.textContent =
      "새로운 퀴즈 생성 완료! 문제 수: " + questions.length;
    startGame();
  } catch (err) {
    console.error(err);
    statusDiv.textContent =
      "퀴즈 생성 중 오류 발생: " + err.message;
  }
});

// 다시 풀어보기: 같은 세트 재시작
retryQuizBtn.addEventListener("click", () => {
  if (!originalQuestions || originalQuestions.length === 0) {
    statusDiv.textContent = "먼저 퀴즈를 한 번 생성해주세요.";
    return;
  }
  questions = JSON.parse(JSON.stringify(originalQuestions));
  statusDiv.textContent = "같은 퀴즈 세트 다시 시작!";
  startGame();
});

// ============ 8. 게임 시작 ============
function startGame() {
  currentQuestionIndex = 0;
  score = 0;
  gameRunning = true;
  feedback.active = false;
  if (questions.length > 0) {
    makeChoicesForQuestion(questions[currentQuestionIndex]);
  }
  gameLoop();
}

// ============ 9. 현재 문제에 대한 선택지 생성 ============
function makeChoicesForQuestion(q) {
  choices = [];
  const boxWidth = 150;
  const boxHeight = 40;
  const fallStartY = -50;

  for (let i = 0; i < q.options.length; i++) {
    const x = (canvas.width * (i + 1)) / 5 - boxWidth / 2;
    const y = fallStartY - i * 80; // 시작 y만 다르게 해서 동시에 떨어지도록
    choices.push({
      text: q.options[i],
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      isCorrect: i === q.answerIndex,
    });
  }
}

// ============ 10. 메인 게임 루프 ============
function gameLoop(timestamp) {
  if (!gameRunning) return;
  update(timestamp);
  draw();
  requestAnimationFrame(gameLoop);
}

// ============ 11. 상태 업데이트 ============
function update(timestamp) {
  // 플레이어 이동
  if (keys["ArrowLeft"] || keys["a"]) {
    player.x -= player.speed;
  }
  if (keys["ArrowRight"] || keys["d"]) {
    player.x += player.speed;
  }

  // 화면 밖 제한
  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) {
    player.x = canvas.width - player.width;
  }

  // 선택지 떨어뜨리기 (속도 느리게)
  const fallSpeed = 1.2;
  for (let i = choices.length - 1; i >= 0; i--) {
    const c = choices[i];
    c.y += fallSpeed;

    // 바닥에 닿았는지
    if (c.y + c.height >= player.y) {
      const overlapX =
        c.x < player.x + player.width && c.x + c.width > player.x;

      if (overlapX) {
        // 플레이어가 받은 경우
        if (c.isCorrect) {
          // 정답: +10점 (감점 없음, 최대 100점은 나중에 계산)
          score += 10;
          if (score > 100) score = 100;
          statusDiv.textContent = "정답! +10점";
          feedback.active = true;
          feedback.isCorrect = true;
          feedback.timer = performance.now();
        } else {
          // 오답: 감점 없음
          statusDiv.textContent = "오답...";
          feedback.active = true;
          feedback.isCorrect = false;
          feedback.timer = performance.now();
        }
      }

      // 받은 경우든 그냥 떨어진 경우든 배열에서 제거
      choices.splice(i, 1);
    }
  }

  // 피드백 타이머 갱신
  if (feedback.active && feedback.timer) {
    const now = performance.now();
    if (now - feedback.timer > feedback.duration) {
      feedback.active = false;
    }
  }

  // 이 문제에 대한 선택지가 다 사라지면 다음 문제로
  if (choices.length === 0 && gameRunning) {
    currentQuestionIndex++;
    if (currentQuestionIndex < questions.length) {
      makeChoicesForQuestion(questions[currentQuestionIndex]);
    } else {
      gameRunning = false;
      statusDiv.textContent =
        "게임 종료! 최종 점수: " + score + " / 100";
    }
  }

  hudDiv.textContent =
    "점수: " +
    score +
    " | 문제: " +
    (currentQuestionIndex + 1) +
    " / " +
    questions.length;
}

// ============ 12. 그리기 ============
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 문제 텍스트
  if (questions[currentQuestionIndex]) {
    ctx.fillStyle = "#fff";
    ctx.font = "18px sans-serif";
    ctx.fillText(questions[currentQuestionIndex].question, 20, 40);
  }

  // 플레이어
  ctx.fillStyle = "#4caf50";
  ctx.fillRect(player.x, player.y, player.width, player.height);

  // 선택지
  ctx.font = "14px sans-serif";
  choices.forEach((c) => {
    ctx.fillStyle = "#2196f3";
    ctx.fillRect(c.x, c.y, c.width, c.height);
    ctx.fillStyle = "#fff";

    // 텍스트가 너무 길어도 박스 안에서만 보이게 간단히 잘라 주기
    const maxLen = 12;
    let text = c.text || "";
    if (text.length > maxLen) {
      text = text.slice(0, maxLen - 1) + "…";
    }

    ctx.fillText(text, c.x + 8, c.y + c.height / 2 + 5);
  });

  // 피드백 (○ / X) 표시
  if (feedback.active) {
    ctx.strokeStyle = "red";
    ctx.fillStyle = "red";
    ctx.lineWidth = 4;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = 40;

    if (feedback.isCorrect) {
      // 빨간 동그라미
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 빨간 X
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    }
  }
}

