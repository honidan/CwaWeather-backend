// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
//  CWA API 設定
// =======================
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY; // .env 裡要有 CWA_API_KEY=你的授權碼

// =======================
//  Middleware
// =======================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =======================
//  讀取「節氣 CSV」到記憶體
// =======================

const SOLAR_CSV_PATH = path.join(__dirname, "A-A0087-003.csv");

/**
 * solarRows 會長這樣：
 * [
 *   { date: '2025-01-01', term: '-', time: '-' },
 *   { date: '2025-01-05', term: '小寒', time: '10:33' },
 *   ...
 * ]
 */
let solarRows = [];

function loadSolarCsv() {
  try {
    const raw = fs.readFileSync(SOLAR_CSV_PATH, "utf8");
    const lines = raw.trim().split(/\r?\n/);

    // 處理第一行標題：日期,節氣,節氣時分（還可能有 BOM）
    const header = lines[0].replace("\ufeff", "");
    const bodyLines = lines.slice(1); // 跳過標題

    solarRows = bodyLines.map((line) => {
      const [date, term, time] = line.split(",");
      return {
        date: date, // '2025-01-01'
        term: term, // '小寒' 或 '-'
        time: time || "-", // '10:33' 或 '-'
      };
    });

    console.log(`📅 節氣 CSV 載入完成，共 ${solarRows.length} 筆`);
  } catch (err) {
    console.error("讀取節氣 CSV 失敗：", err.message);
    solarRows = [];
  }
}

// 啟動伺服器時先讀一次
loadSolarCsv();

// =======================
//  節氣 / 季節 / 說明
// =======================

function getSeasonByTerm(term) {
  const spring = ["立春", "雨水", "驚蟄", "春分", "清明", "穀雨"];
  const summer = ["立夏", "小滿", "芒種", "夏至", "小暑", "大暑"];
  const autumn = ["立秋", "處暑", "白露", "秋分", "寒露", "霜降"];
  const winter = ["立冬", "小雪", "大雪", "冬至", "小寒", "大寒"];

  if (spring.includes(term)) return "春";
  if (summer.includes(term)) return "夏";
  if (autumn.includes(term)) return "秋";
  if (winter.includes(term)) return "冬";
  return "未知";
}

function getSolarNote(term) {
  const map = {
    小寒: "寒氣始深，宜藏精養腎，注意保暖。",
    大寒: "一年中最冷之時，宜溫補護陽。",
    立春: "陽氣漸生，萬物萌芽，飲食宜溫和。",
    雨水: "雨量漸增，濕氣起，宜健脾祛濕。",
    驚蟄: "萬物驚醒，肝氣漸旺，宜疏肝理氣。",
    春分: "晝夜平分，陰陽平衡，飲食宜清淡。",
    清明: "氣溫回暖，適合踏青，注意過敏。",
    穀雨: "雨生百穀，濕氣稍重，宜健脾。",
    立夏: "漸入炎夏，宜養心護脾。",
    小滿: "雨水增多，濕熱上升，宜清暑利濕。",
    芒種: "農忙時節，注意防暑與飲食清潔。",
    夏至: "日照最長，暑熱漸盛，宜養心安神。",
    小暑: "暑氣將盛，宜清熱消暑。",
    大暑: "一年最熱之時，注意中暑與補水。",
    立秋: "暑退涼生，宜潤肺養陰。",
    處暑: "暑氣漸止，早晚轉涼，注意溫差。",
    白露: "露水漸重，燥氣起，宜潤燥護肺。",
    秋分: "晝夜再平，秋意漸濃，宜養陰潤燥。",
    寒露: "氣溫下降，注意保暖，少貪涼。",
    霜降: "霜降草木，冷意顯著，宜溫補。",
    立冬: "冬令開始，宜養腎藏精。",
    小雪: "開始下雪，寒冷漸增，注意保暖。",
    大雪: "雪勢增強，嚴寒來臨，宜禦寒進補。",
    冬至: "陰極之時，陽氣始生，宜溫陽散寒。",
  };
  return map[term] || "順應當令，飲食宜平和，少生冷。";
}

/**
 * 找「目前所屬節氣」
 * - 先看今天是不是節氣當天
 * - 不是就往前找最近一個有節氣的日期
 */
function findCurrentSolarTerm(dateObj) {
  // ⚠️ 這裡用的是伺服器時間的 UTC 日期
  // 如果之後要超精準的「台灣時區」，可以改用 dayjs-timezone
  const todayStr = dateObj.toISOString().slice(0, 10); // 'YYYY-MM-DD'

  if (!solarRows.length) return null;

  // 1. 先找今天剛好是節氣那一天
  const todayRow = solarRows.find(
    (r) => r.date === todayStr && r.term && r.term !== "-"
  );
  if (todayRow) {
    const season = getSeasonByTerm(todayRow.term);
    return {
      date: todayRow.date,
      term: todayRow.term,
      time: todayRow.time,
      season,
      note: getSolarNote(todayRow.term),
    };
  }

  // 2. 否則往前找最近一個有節氣名稱的日期
  const rowsBefore = solarRows
    .filter((r) => r.date <= todayStr && r.term && r.term !== "-")
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // 日期新的排前面

  if (rowsBefore.length > 0) {
    const r = rowsBefore[0];
    const season = getSeasonByTerm(r.term);
    return {
      date: r.date,
      term: r.term,
      time: r.time,
      season,
      note: getSolarNote(r.term),
    };
  }

  // 找不到就回 null（正常情況不太會發生）
  return null;
}

// =======================
//  飲食建議（從前端搬到後端）
// =======================

/**
 * termInfo: { season: "春" | "夏" | "秋" | "冬" | "未知", ... }
 * avgTemp: 平均溫度（數字）
 * weatherText: 天氣描述，例如「多雲時晴短暫陣雨」
 */
function getDietAdviceBySolar(termInfo, avgTemp, weatherText) {
  const t = avgTemp || 0;
  const w = weatherText || "";
  let main = "";
  let sub = "";

  if (termInfo?.season === "冬") {
    main = "宜溫補、養腎藏陽為主。";
    sub =
      "可適量食用薑湯、羊肉湯、麻油雞、紅棗、黑芝麻等，既溫暖又不過於燥熱。避免大量生冷、冰品，以免傷脾陽。";
  } else if (termInfo?.season === "夏") {
    main = "宜清淡、清暑利濕為主。";
    sub =
      "可選擇綠豆湯、薏仁、冬瓜、苦瓜等，幫助清暑、利濕、護心氣。少吃太油膩、太辛辣，以免加重心火與腸胃負擔。";
  } else if (termInfo?.season === "春") {
    main = "宜疏肝、健脾、溫和少躁。";
    sub =
      "可多吃時令青菜（如菠菜、芥菜）、山藥、紅棗，幫助肝氣條達、脾胃運化。少喝過冰飲料，避免傷脾胃。";
  } else if (termInfo?.season === "秋") {
    main = "宜潤肺養陰、少辛增酸。";
    sub =
      "可適量食用梨子、百合、蓮子、銀耳湯、芝麻等，幫助潤燥護肺。避免過多燒烤、辛辣，以免加重燥熱。";
  } else {
    main = "飲食宜平和、順應當令食材。";
    sub =
      "多選擇當季蔬菜與適量穀物，少加工、少油炸，就是最好的養生方式。";
  }

  // 依「溫度」微調建議
  if (t >= 28) {
    main = "天氣偏熱，宜清涼解暑、護心養陰。";
    sub =
      "可飲用溫溫的綠豆湯、薄荷茶、菊花茶，搭配苦瓜、冬瓜等清淡菜餚。雖然炎熱，也不建議狂灌冰飲，以免傷害腸胃。";
  } else if (t <= 18) {
    main = "氣溫偏低，宜溫暖脾胃、適度進補。";
    sub =
      "薑茶、紅棗桂圓茶、燉湯類（雞湯、牛肉湯）都很適合。可以搭配根莖類如山藥、南瓜，幫助保暖又不太燥。";
  }

  // 若天氣描述有「雨」字，再補一段祛濕建議
  if (w.includes("雨")) {
    sub +=
      " 近期雨勢較多，濕氣易重，可適量食用薏仁、紅豆、冬瓜，幫助利水祛濕，少吃太鹹、太油膩的食物。";
  }

  return { main, sub };
}

// =======================
//  天氣 API：高雄市
// =======================

/**
 * GET /api/weather/kaohsiung
 * 回傳格式：
 * {
 *   success: true,
 *   data: {
 *     city: "高雄市",
 *     updateTime: "...",
 *     forecasts: [ { startTime, endTime, weather, rain, minTemp, maxTemp, comfort, windSpeed }, ... ],
 *     solar: { date, term, time, season, note },
 *     diet: { main, sub }
 *   }
 * }
 */
app.get("/api/weather/kaohsiung", async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: "嘉義縣", // 你也可以改成前端帶參數進來
        },
      }
    );

    const records = response.data?.records;
    const locationData = records?.location?.[0];

    if (!locationData) {
      return res.status(404).json({
        success: false,
        error: "查無資料",
        message: "無法取得高雄市天氣資料",
      });
    }

    // 整理氣象資料
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    const forecasts = [];

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: "", // 起始時間
        endTime: "",   // 結束時間
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
        windSpeed: "",
      };

      weatherElements.forEach((element) => {
        const item = element.time[i];
        const param = item.parameter;

        // 用第一個元素的時間作為 start/end（例如 Wx）
        if (!forecast.startTime && item.startTime) {
          forecast.startTime = item.startTime;
          forecast.endTime = item.endTime;
        }

        switch (element.elementName) {
          case "Wx": // 天氣現象
            forecast.weather = param.parameterName;
            break;
          case "PoP": // 降雨機率
            forecast.rain = param.parameterName + "%";
            break;
          case "MinT": // 最低溫
            forecast.minTemp = param.parameterName + "°C";
            break;
          case "MaxT": // 最高溫
            forecast.maxTemp = param.parameterName + "°C";
            break;
          case "CI": // 舒適度
            forecast.comfort = param.parameterName;
            break;
          case "WS": // 風速
            forecast.windSpeed = param.parameterName;
            break;
        }
      });

      forecasts.push(forecast);
    }

    const weatherData = {
      city: locationData.locationName,
      updateTime: records.datasetDescription || "",
      forecasts,
    };

    // ========= 節氣 & 飲食建議 整合 =========
    const now = new Date();
    const solarInfo = findCurrentSolarTerm(now);

    let dietInfo = null;
    if (solarInfo && forecasts.length > 0) {
      const first = forecasts[0];
      const maxT = parseInt(first.maxTemp, 10) || 0;
      const minT = parseInt(first.minTemp, 10) || 0;
      const avgTemp = Math.round((maxT + minT) / 2);

      dietInfo = getDietAdviceBySolar(
        { season: solarInfo.season },
        avgTemp,
        first.weather
      );
    }

    weatherData.solar = solarInfo; // { date, term, time, season, note } 或 null
    weatherData.diet = dietInfo;   // { main, sub } 或 null

    return res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    // CWA 回傳錯誤時，response 物件裡會有更多資訊
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: "取得氣象資料時發生錯誤",
        message: error.response.data || error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: "伺服器內部錯誤",
      message: error.message,
    });
  }
});

// =======================
//  Root & 404
// =======================

app.get("/", (req, res) => {
  res.json({
    message: "天氣 + 節氣 API 服務運作中",
    endpoints: ["/api/weather/kaohsiung"],
  });
});

// 404 handler（放在所有路由之後）
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "找不到此路徑",
  });
});

// =======================
//  啟動伺服器
// =======================

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行中，Port: ${PORT}`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});
