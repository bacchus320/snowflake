const mountains = [
  {
    id: "taebaeksan",
    name: "Taebaeksan",
    localName: "태백산",
    lat: 37.083,
    lon: 128.933,
    elevation: 1567,
    region: "Gangwon / Gyeongbuk"
  },
  {
    id: "daedunsan",
    name: "Daedunsan",
    localName: "대둔산",
    lat: 36.1187,
    lon: 127.3207,
    elevation: 878,
    region: "Chungnam / Jeonbuk"
  },
  {
    id: "deogyusan",
    name: "Deogyusan Mountain (Hyangjeokbong Peak)",
    localName: "덕유산 (향적봉)",
    lat: 35.8563,
    lon: 127.7412,
    elevation: 1614,
    region: "Muju, Jeonbuk"
  },
  {
    id: "hallasan",
    name: "Hallasan",
    localName: "한라산",
    lat: 33.3617,
    lon: 126.5292,
    elevation: 1947,
    region: "Jeju"
  },
  {
    id: "nogodan",
    name: "Nogodan",
    localName: "노고단",
    lat: 35.2936,
    lon: 127.5321,
    elevation: 1507,
    region: "Jeonnam (Jirisan NW)"
  },
  {
    id: "balwangsan",
    name: "Balwangsan",
    localName: "발왕산",
    lat: 37.6070,
    lon: 128.6710,
    elevation: 1459,
    region: "Pyeongchang, Gangwon"
  },
  {
    id: "sobaeksan",
    name: "Sobaeksan",
    localName: "소백산",
    lat: 36.9560,
    lon: 128.4842,
    elevation: 1439,
    region: "Chungbuk / Gyeongbuk"
  },
  {
    id: "seonjaryeong",
    name: "Seonjaryeong",
    localName: "선자령",
    lat: 37.7223,
    lon: 128.7451,
    elevation: 1157,
    region: "Gangneung / Pyeongchang"
  },
  {
    id: "mudeungsan",
    name: "Mudeungsan",
    localName: "무등산",
    lat: 35.1392,
    lon: 126.9925,
    elevation: 1187,
    region: "Gwangju / Jeonnam"
  }
];

const statusEl = document.getElementById("status");
const listEl = document.getElementById("mountain-list");
const dayButtons = document.querySelectorAll(".day-button");

let selectedDayOffset = 1; // 1 = +1 day, 2 = +2 days
let forecastReady = false;
let mountainForecasts = {};

dayButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const day = Number(btn.dataset.day);
    if (selectedDayOffset === day) return;
    selectedDayOffset = day;
    dayButtons.forEach((b) => b.classList.toggle("active", b === btn));
    if (forecastReady) {
      renderMountains();
    }
  });
});

async function fetchForecastForMountain(mountain) {
  const params = new URLSearchParams({
    latitude: mountain.lat,
    longitude: mountain.lon,
    timezone: "Asia/Seoul",
    forecast_days: "3",
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "snowfall_sum",
      "precipitation_probability_max"
    ].join(",")
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch for ${mountain.name}`);
  }
  const data = await res.json();
  return data.daily;
}

function computeSnowScore(daily, index) {
  // index: which day (0=today, 1=+1 day, 2=+2 days)
  const tMax = daily.temperature_2m_max?.[index];
  const tMin = daily.temperature_2m_min?.[index];
  const snow = daily.snowfall_sum?.[index];
  const precip = daily.precipitation_sum?.[index];
  const pop = daily.precipitation_probability_max?.[index];

  let score = 0;
  let reasons = [];

  if (typeof tMax === "number" && typeof tMin === "number") {
    if (tMax <= -2) {
      score += 2;
      reasons.push("매우 추움");
    } else if (tMax < 1 && tMin <= -1) {
      score += 2;
      reasons.push("영하권 유지");
    } else if (tMin <= 0) {
      score += 1;
      reasons.push("영하로 떨어짐");
    } else if (tMax >= 4) {
      score -= 2;
      reasons.push("영상 기온, 녹을 수 있음");
    }
  }

  if (typeof snow === "number") {
    if (snow >= 5) {
      score += 3;
      reasons.push("눈 많이 예정");
    } else if (snow >= 1) {
      score += 2;
      reasons.push("눈 약간 예정");
    } else if (snow === 0 && typeof precip === "number" && precip > 0 && tMax <= 1) {
      score += 1;
      reasons.push("습기 + 영하, 상고대 가능");
    }
  }

  if (typeof pop === "number") {
    if (pop >= 70 && tMax <= 1) {
      score += 1;
      reasons.push("강수 확률 높음 (눈 가능)");
    } else if (pop >= 70 && tMax >= 3) {
      score -= 1;
      reasons.push("강수는 비일 가능성");
    }
  }

  let label = "No data";
  let emoji = "？";
  let level = "unknown";

  if (!Number.isFinite(score)) {
    score = 0;
  }

  if (score >= 6) {
    label = "Excellent snowflakes";
    emoji = "❄❄❄";
    level = "high";
  } else if (score >= 4) {
    label = "Good chance";
    emoji = "❄❄";
    level = "medium";
  } else if (score >= 2) {
    label = "Maybe";
    emoji = "❄?";
    level = "low";
  } else if (score <= 1) {
    label = "Unlikely";
    emoji = "✖";
    level = "none";
  }

  return { score, label, emoji, level, reasons };
}

function formatDateLabel(iso) {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${mm}/${dd} (${weekday})`;
}

function renderMountains() {
  listEl.innerHTML = "";

  mountains.forEach((m) => {
    const daily = mountainForecasts[m.id];
    const card = document.createElement("article");
    card.className = "mountain-card";

    const inner = document.createElement("div");
    inner.className = "mountain-card-inner";

    const header = document.createElement("div");
    header.className = "mountain-header";

    const titleWrap = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "mountain-name";
    nameEl.textContent = `${m.localName} (${m.name})`;

    const metaEl = document.createElement("div");
    metaEl.className = "mountain-meta";
    metaEl.textContent = `${m.elevation.toLocaleString()} m`;

    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(metaEl);

    const regionBadge = document.createElement("div");
    regionBadge.className = "badge-region";
    regionBadge.innerHTML = `<span>📍</span><span>${m.region}</span>`;

    header.appendChild(titleWrap);
    header.appendChild(regionBadge);

    inner.appendChild(header);

    if (!daily || !daily.time) {
      const p = document.createElement("p");
      p.textContent = "Forecast unavailable.";
      inner.appendChild(p);
      card.appendChild(inner);
      listEl.appendChild(card);
      return;
    }

    const dayIndex = selectedDayOffset; // 1 or 2
    const fallbackIndex = 0;
    const idx = daily.time[dayIndex] ? dayIndex : fallbackIndex;

    const snowScore = computeSnowScore(daily, idx);
    const dateLabel = formatDateLabel(daily.time[idx]);

    const scoreLine = document.createElement("div");
    scoreLine.className = "snow-score-line";
    scoreLine.innerHTML = `
      <span class="snow-score-label">${snowScore.emoji} ${snowScore.label}</span>
      <span class="snow-score-tag">${dateLabel}</span>
    `;

    inner.appendChild(scoreLine);

    const daySummary = document.createElement("div");
    daySummary.className = "day-summary";

    const makeDayCard = (offset) => {
      const dayIdx = daily.time[offset] ? offset : fallbackIndex;
      const dLabel = offset === 1 ? "+1 day" : offset === 2 ? "+2 days" : "Today";
      const dScore = computeSnowScore(daily, dayIdx);
      const tMax = daily.temperature_2m_max[dayIdx];
      const tMin = daily.temperature_2m_min[dayIdx];
      const snow = daily.snowfall_sum[dayIdx];
      const precip = daily.precipitation_sum[dayIdx];
      const pop = daily.precipitation_probability_max[dayIdx];

      const container = document.createElement("div");
      container.className = "day-card";

      const chip = document.createElement("div");
      chip.className = "day-chip";
      chip.innerHTML = `<span>${dScore.emoji}</span><span>${dLabel}</span>`;

      const tempRow = document.createElement("div");
      tempRow.className = "day-row";
      tempRow.innerHTML = `
        <span class="label">기온</span>
        <span class="temp-highlight">${Math.round(tMin)}° / ${Math.round(tMax)}°C</span>
      `;

      const snowRow = document.createElement("div");
      snowRow.className = "snow-line";
      snowRow.innerHTML = `
        <span class="label">눈·강수</span>
        <span>${snow.toFixed(1)} cm / ${precip.toFixed(1)} mm</span>
      `;

      const chanceRow = document.createElement("div");
      chanceRow.className = "day-row";
      chanceRow.innerHTML = `
        <span class="label">강수확률</span>
        <span class="chance-pill">${pop}%</span>
      `;

      container.appendChild(chip);
      container.appendChild(tempRow);
      container.appendChild(snowRow);
      container.appendChild(chanceRow);

      return container;
    };

    daySummary.appendChild(makeDayCard(1));
    daySummary.appendChild(makeDayCard(2));

    inner.appendChild(daySummary);
    card.appendChild(inner);
    listEl.appendChild(card);
  });
}

async function init() {
  statusEl.textContent = "Loading forecasts from Open‑Meteo…";
  try {
    const promises = mountains.map(async (m) => {
      try {
        const daily = await fetchForecastForMountain(m);
        mountainForecasts[m.id] = daily;
      } catch (err) {
        console.error(err);
      }
    });

    await Promise.all(promises);
    forecastReady = true;
    statusEl.textContent = "Tap +1 day / +2 days to switch view.";
    renderMountains();
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Failed to load forecast. Please try again later.";
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch((err) => console.error("SW registration failed", err));
  });
}

init();
