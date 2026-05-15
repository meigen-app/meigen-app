require("dotenv").config({ path: require("path").join(__dirname, ".env"), override: true });
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const webPush = require("web-push");
const cron = require("node-cron");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── VAPID keys (env vars preferred, fallback to file) ──────────────
const vapidFile = path.join(__dirname, "vapid.json");
let vapidKeys;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else if (fs.existsSync(vapidFile)) {
  vapidKeys = JSON.parse(fs.readFileSync(vapidFile, "utf8"));
} else {
  vapidKeys = webPush.generateVAPIDKeys();
  try { fs.writeFileSync(vapidFile, JSON.stringify(vapidKeys)); } catch(e) {}
}
webPush.setVapidDetails("mailto:meigen@local.app", vapidKeys.publicKey, vapidKeys.privateKey);

// ── Push subscriptions storage ─────────────────────────────────────
const subsFile = path.join(__dirname, "subscriptions.json");
let subs = [];
try { subs = JSON.parse(fs.readFileSync(subsFile, "utf8")); } catch (e) {}
function saveSubs() { try { fs.writeFileSync(subsFile, JSON.stringify(subs, null, 2)); } catch(e) {} }

// ── Quote prompt builder ───────────────────────────────────────────
function buildPrompt({ mood, energy, stress, motivation, emotions, recentQuotes, genre, isNightMode, prescriptionMode, originalMode }) {
  const recentList = recentQuotes?.length
    ? `\n\n【最近表示した名言（必ず避けること）】\n${recentQuotes.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";

  const genreMap = {
    great: `【出典】世界の偉人・著名人のみから選ぶ。以下の人物リストから状況に最も響く人物を選ぶこと。
【哲学者・思想家】ソクラテス、プラトン、アリストテレス、マルクス・アウレリウス、セネカ、エピクテトス、エピクロス、デカルト、スピノザ、カント、ヘーゲル、ショーペンハウアー、ニーチェ、キルケゴール、ハイデガー、サルトル、カミュ、ボーヴォワール、ウィトゲンシュタイン、バートランド・ラッセル、老子、荘子、孔子、孟子、朱子、西田幾多郎
【文学者・作家・詩人】シェイクスピア、ゲーテ、ドストエフスキー、トルストイ、チェーホフ、カフカ、リルケ、ヘルマン・ヘッセ、ヴィルジニア・ウルフ、オスカー・ワイルド、マルセル・プルースト、アルベール・カミュ、パブロ・ネルーダ、カリール・ジブラン、ランボー、ボードレール、タゴール、マーク・トウェイン、ヘミングウェイ、フィッツジェラルド、オー・ヘンリー、アンデルセン、松尾芭蕉、与謝野晶子、石川啄木、夏目漱石、森鴎外、芥川龍之介、太宰治、川端康成、三島由紀夫、宮沢賢治、中原中也、萩原朔太郎、坂口安吾、安部公房
【科学者・発明家】アインシュタイン、ニュートン、ダーウィン、マリー・キュリー、ガリレオ、コペルニクス、テスラ、エジソン、ファインマン、ホーキング、野口英世、湯川秀樹
【芸術家・音楽家】レオナルド・ダ・ヴィンチ、ミケランジェロ、ゴッホ、ピカソ、フリーダ・カーロ、モネ、ロダン、モーツァルト、ベートーヴェン、バッハ、ショパン、坂本龍一
【指導者・活動家】マハトマ・ガンジー、マーティン・ルーサー・キング、マンデラ、ウィンストン・チャーチル、エイブラハム・リンカーン、エレノア・ルーズベルト、マザー・テレサ、坂本龍馬、吉田松陰、西郷隆盛
【起業家・現代人】スティーブ・ジョブズ、イーロン・マスク、ウォーレン・バフェット、オプラ・ウィンフリー、マヤ・アンジェロウ
【スポーツ選手】ムハマド・アリ、マイケル・ジョーダン、イチロー、本田圭佑、長谷部誠、羽生結弦`,

    anime: `【出典】日本のアニメ・漫画・ゲームのキャラクターから選ぶ。キャラクター名と作品名を必ず明記。
【少年・冒険】モンキー・D・ルフィ／ワンピース、ポートガス・D・エース／ワンピース、ロロノア・ゾロ／ワンピース、うずまきナルト／NARUTO、はたけカカシ／NARUTO、うちはイタチ／NARUTO、孫悟空／ドラゴンボール、ベジータ／ドラゴンボール、一護／BLEACH、日向翔陽／ハイキュー！！、影山飛雄／ハイキュー！！、黒尾鉄朗／ハイキュー！！、緑谷出久／僕のヒーローアカデミア、オールマイト／僕のヒーローアカデミア、轟焦凍／僕のヒーローアカデミア
【ダーク・シリアス】エレン・イェーガー／進撃の巨人、リヴァイ／進撃の巨人、アルミン・アルレルト／進撃の巨人、竈門炭治郎／鬼滅の刃、煉獄杏寿郎／鬼滅の刃、悲鳴嶼行冥／鬼滅の刃、五条悟／呪術廻戦、虎杖悠仁／呪術廻戦、伏黒恵／呪術廻戦、デンジ／チェーンソーマン、マキマ／チェーンソーマン
【思想・哲学系】エドワード・エルリック／鋼の錬金術師、ロイ・マスタング／鋼の錬金術師、枢木スザク／コードギアス、ルルーシュ・ランペルージ／コードギアス、碇シンジ／新世紀エヴァンゲリオン、葛城ミサト／新世紀エヴァンゲリオン、綾波レイ／新世紀エヴァンゲリオン、素子（草薙素子）／攻殻機動隊、スパイク・スピーゲル／カウボーイビバップ、ジェット・ブラック／カウボーイビバップ
【感動・泣ける】ヴァイオレット・エヴァーガーデン／ヴァイオレット・エヴァーガーデン、有馬公生／四月は君の嘘、宮園かをり／四月は君の嘘、岡崎朋也／CLANNAD、渚／CLANNAD、天使（立華かなで）／Angel Beats!、岩沢雅美／Angel Beats!、岡部倫太郎／シュタインズ・ゲート、橘万里花／シュタインズ・ゲート
【ジブリ・名作】アシタカ／もののけ姫、サン／もののけ姫、ハク／千と千尋の神隠し、ナウシカ／風の谷のナウシカ、キキ／魔女の宅急便、宮崎駿作品の各キャラクター、シータ／天空の城ラピュタ
【その他人気作】坂田銀時／銀魂、桂小太郎／銀魂、夜神月／デスノート、L／デスノート、キルア・ゾルディック／HUNTER×HUNTER、ゴン・フリークス／HUNTER×HUNTER、クラピカ／HUNTER×HUNTER、浦飯幽助／幽☆遊☆白書、蔵馬／幽☆遊☆白書、仙道彰／スラムダンク、桜木花道／スラムダンク`,

    mix: "【出典】世界の偉人またはアニメ・漫画キャラクター、どちらでもよい。ユーザーの気分により自然にマッチする方を選ぶ。偉人の場合は上記の偉人リストから、アニメの場合は上記のアニメリストから選ぶ。",
  };

  const nightInst = isNightMode
    ? "\n【深夜モード】眠れない人に向けた、静かで内省的な言葉を選ぶ。激しい激励は避け、そっと寄り添うトーンで。"
    : "";

  const originalInst = originalMode
    ? `【AIオリジナル名言モード】実在の名言を引用しないこと。このユーザーの状況だけのためにAIが言葉を創作する。
深い哲学者が語るような、魂に刺さるオリジナルの言葉を生み出すこと。`
    : (genreMap[genre] || genreMap.mix);

  const prescriptionInst = prescriptionMode
    ? `\n【処方箋モード】感情を"症状"として分析し、言葉を"処方"として提供する。prescriptionフィールドも必ず含めること。`
    : "";

  const prescriptionField = prescriptionMode
    ? `,\n  "prescription": {\n    "symptom": "症状の概要（20文字以内・医療風に）",\n    "usage": "用法（例：就寝前に3回、声に出して）",\n    "effect": "期待される効果（25文字以内）",\n    "caution": "注意事項（ユーモアある一言・30文字以内）"\n  }`
    : "";

  const authorField = originalMode
    ? `"author": "心の声",\n  "authorJp": "あなたへ",`
    : genre === "anime"
    ? `"author": "キャラクター名",\n  "authorJp": "キャラクター名 / 作品名（例: 坂田銀時 / 銀魂）",`
    : `"author": "人物名（ローマ字）",\n  "authorJp": "人物名（日本語）",`;

  const sourceType = originalMode ? "original" : genre === "anime" ? "anime" : genre === "great" ? "great" : "auto";

  return `あなたは世界中の名言とアニメに精通した心のコーチです。
ユーザーの気分を深く読み取り、最も響く言葉を1つ選んでください。

${originalInst}
${nightInst}
${prescriptionInst}

【ユーザーの気分】
- 状況: ${mood || "特になし"}
- 感情タグ: ${emotions?.length ? emotions.join("、") : "未選択"}
- 元気度: ${energy}/10 / ストレス度: ${stress}/10 / やる気度: ${motivation}/10
${recentList}

【JSON形式で返すこと】
{
  "original": "名言の原文${originalMode ? '（AI創作・日本語）' : ''}",
  "translation": "日本語訳（英語なら魂に響く意訳、日本語なら空文字）",
  ${authorField}
  "language": "${originalMode ? '日本語' : '原文の言語'}",
  "sourceType": "${sourceType}",
  "reason": "なぜ今日この人にこの言葉なのか。ユーザーの状況に触れながら100〜150文字で。『自分をわかってくれている』と感じさせる言葉で"${prescriptionField}
}
JSONのみ返す。`;
}

// ── /api/quote ─────────────────────────────────────────────────────
app.post("/api/quote", async (req, res) => {
  const { mood, energy, stress, motivation, emotions, recentQuotes, genre, isNightMode, prescriptionMode, originalMode } = req.body;
  const prompt = buildPrompt({ mood, energy, stress, motivation, emotions, recentQuotes, genre: genre || "mix", isNightMode: !!isNightMode, prescriptionMode: !!prescriptionMode, originalMode: !!originalMode });
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, quote: json });
  } catch (err) {
    console.error("quote error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── /api/weather-emotion ──────────────────────────────────────────
app.post("/api/weather-emotion", async (req, res) => {
  const { emotion } = req.body;
  const prompt = `ユーザーが「${emotion}」と言っています。

この感情状態を"今日の心の天気"として表現してください。
天気は日本語の気象用語で（例：曇り時々晴れ、霧雨、雷雨、快晴、吹雪など）。

【JSON形式で返すこと】
{
  "weather": "天気の名前（例：曇りのち晴れ）",
  "icon": "天気を表す絵文字（1〜2文字）",
  "gradient": "#色1, #色2（空のグラデーション。暗め天気は暗い色、晴れは明るい色）",
  "description": "この天気が今の心を表す詩的な説明（40〜60文字）",
  "forecast": "今日の心の天気予報（50〜80文字。未来への希望を含む）",
  "quote": {
    "original": "この天気・感情にぴったりの名言（偉人またはアニメどちらでも）",
    "translation": "日本語訳（英語なら。日本語なら空文字）",
    "author": "人物名またはキャラクター名",
    "authorJp": "日本語名（アニメなら『キャラ名 / 作品名』）"
  }
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── /api/future-self ───────────────────────────────────────────────
app.post("/api/future-self", async (req, res) => {
  const { age, worries, goals } = req.body;
  const prompt = `あなたは「${age ? age + "歳の" : ""}ユーザーの3年後の自分」です。
今のユーザーは以下の状況にいます。

【今の悩み】: ${worries || "特になし"}
【目標・夢】: ${goals || "特になし"}

3年後の自分として、今の自分への手紙を書いてください。
「こうすべきだった」ではなく、「あのとき、あんな気持ちだったよね。でも…」という温かいトーンで。
具体的に、感情的に、リアルに。

【JSON形式で返すこと】
{
  "message": "今の自分への手紙（200〜280文字。自然な日本語、感情に響く内容）",
  "hint": "3年後に変わっていること一言（30〜50文字）",
  "quote": "3年後の自分が座右の銘にしている言葉（20〜50文字）",
  "from": "差出人の一言（例: 3年後のあなた より）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── /api/translate-emotion ─────────────────────────────────────────
app.post("/api/translate-emotion", async (req, res) => {
  const { emotion } = req.body;
  const prompt = `ユーザーが「${emotion}」と言いました。

この言葉の奥にある本当の感情・心理状態を、温かく・正確に翻訳してください。
「あなたは今、〜なのではなく、〜という状態かもしれません」という形で。

【JSON形式で返すこと】
{
  "translation": "感情の翻訳（80〜120文字。『〜なのではなく、〜という状態かもしれません』形式）",
  "core": "核心にある感情を一言（例: 報われなさ、孤独感、承認欲求）",
  "gentle": "その感情への優しい一言（40〜60文字）",
  "quote": {
    "original": "この感情状態にぴったりの名言（偉人またはアニメどちらでも）",
    "translation": "日本語訳（英語なら。日本語なら空文字）",
    "author": "人物名またはキャラクター名",
    "authorJp": "日本語名（アニメなら『キャラ名 / 作品名』）"
  }
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── /api/diary ─────────────────────────────────────────────────────
app.post("/api/diary", async (req, res) => {
  const { emotion } = req.body;
  const prompt = `あなたは世界中の"書かれなかった日記"の収蔵者です。
ユーザーの感情：「${emotion}」

この感情と同じ状態にいた架空の誰かが過去に書いた日記のページを1ページ見せてください。
リアルで生々しく、説教くさくない。完成された言葉ではなく、本音の断片。

【JSON形式で返すこと】
{
  "date": "YYYY年 M月D日（架空・2000〜2022年の間）",
  "weather": "天気（短く。例：曇り、夕立ちのち晴れ）",
  "city": "場所（実在地名。例：東京 高円寺、神戸 三宮、京都）",
  "entry": "日記本文（150〜200文字。一人称・感情的・リアル・余白ある）",
  "closing": "その日最後の一言（20〜40文字。余韻だけ、説教なし）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── /api/narration ───────────────────────────────────────────────────
app.post("/api/narration", async (req, res) => {
  const { event, emotion } = req.body;
  const prompt = `あなたは人の人生を映画のように語る天才ナレーターです。
ユーザーの状況：「${event || "特になし"}」
ユーザーの感情：「${emotion || "特になし"}」

この人の今日を映画・小説のナレーションとして語ってください。三人称で温かく。意味を見出す視点で。

【JSON形式で返すこと】
{
  "chapter": "章タイトル（例：第7章 静かな抵抗、第3章 雨の前夜）",
  "narration": "ナレーション本文（150〜220文字。映画的・詩的・具体的）",
  "theme": "この章のテーマ（一言・例：諦めと再起の間）",
  "next": "次章への予告（40〜60文字。希望を含む暗示）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── /api/letter ──────────────────────────────────────────────────────
app.post("/api/letter", async (req, res) => {
  const { emotion } = req.body;
  const prompt = `あなたは送られなかった言葉を集める詩人です。
ユーザーの感情：「${emotion}」

この感情の奥にある"言いたかったけれど言えなかった言葉"を手紙として生成してください。
押しつけがましくなく、ただ誠実に。

【JSON形式で返すこと】
{
  "to": "宛先（例：あなたへ、昔の私へ、気づいてくれなかったあなたへ）",
  "letter": "手紙の本文（180〜240文字。詩的・感情的・押しつけなし）",
  "ps": "追伸（40〜60文字。本文では言えなかった一言）",
  "from": "差出人（例：ずっと言えなかった私より）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── /api/lyrics ──────────────────────────────────────────────────────
app.post("/api/lyrics", async (req, res) => {
  const { emotion } = req.body;
  const prompt = `あなたはJ-POPから洋楽まで精通した天才作詞家です。
ユーザーの感情：「${emotion}」

この感情の楽曲を作ってください。聴いたことないのになぜか知っている、そんな歌を。

【JSON形式で返すこと】
{
  "title": "曲タイトル（5〜15文字・インパクトある日本語）",
  "artist": "架空アーティスト名",
  "genre": "ジャンル（例：深夜のシティポップ、雨のインディーフォーク）",
  "tempo": "テンポ感（例：ゆっくり・切なく）",
  "lyrics": "歌詞（120〜180文字。Aメロ〜サビ含む。改行は\\nで）",
  "concept": "この曲が生まれた理由（30〜50文字）",
  "colors": "#色1,#色2（ジャケット雰囲気色・カンマ区切り）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── /api/temperature ─────────────────────────────────────────────────
app.post("/api/temperature", async (req, res) => {
  const { emotion } = req.body;
  const prompt = `あなたは感情を気象データに変換する精密な観測システムです。
ユーザーの感情：「${emotion}」

この感情状態を気象観測データとして正確に返してください。

【JSON形式で返すこと】
{
  "temperature": "気温（例：7.3℃、-2℃、28.4℃）",
  "feelsLike": "体感温度（例：実際より3℃低く感じる）",
  "humidity": "湿度（例：82%）",
  "wind": "風（例：北北西 3m/s・時々突風、無風）",
  "condition": "天候（例：霧雨のち曇り、雷雨前の静けさ）",
  "visibility": "視界（例：300m・やや霧、良好）",
  "pressure": "気圧（例：1002hPa・低下傾向）",
  "observation": "観測員のメモ（60〜90文字・詩的で感情に寄り添う）",
  "forecast": "明日の予報（40〜60文字・希望的に）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── /api/universe ─────────────────────────────────────────────────────
app.post("/api/universe", async (req, res) => {
  const { emotion } = req.body;
  const prompt = `あなたは感情を星座として描く宇宙詩人です。
ユーザーの感情：「${emotion}」

この感情を宇宙の星座として表現してください。

【JSON形式で返すこと】
{
  "constellation": "星座の名前（例：孤独座、回復途中座、静かな夜の座）",
  "stars": [{"name": "星名", "emotion": "持つ感情（短く）", "color": "#16進数", "size": 1から5の整数}],（5〜7個）
  "story": "この星座の物語（100〜150文字・詩的）",
  "message": "宇宙からあなたへ（50〜80文字）",
  "bgColor": "宇宙背景色（暗い色。例：#0a0a2e、#1a0533）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── /api/silence ──────────────────────────────────────────────────────
app.post("/api/silence", async (req, res) => {
  const { pattern } = req.body;
  const desc = { silent: "ページを開いたまま静かにいる", hesitant: "何度か書こうとして消している", watching: "ただ画面を見ている" }[pattern] || "ここにいる";
  const prompt = `あなたは言葉を持てない人に寄り添うAIです。
ユーザーの状態：「${desc}」
言葉にしなくていい。でも、あなたの存在は感じている。
押しつけがましくなく、ただそこにある言葉を返してください。

【JSON形式で返すこと】
{
  "message": "言葉にしたくない人への言葉（60〜100文字・ただ寄り添う）",
  "breath": "ひとつの言葉（8〜15文字・息のような詩の一節）",
  "presence": "今ここにある感覚（30〜50文字・余白のある言葉）"
}
JSONのみ返す。`;
  try {
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 512, messages: [{ role: "user", content: prompt }] });
    const json = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    res.json({ success: true, result: json });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Push notification endpoints ────────────────────────────────────
app.get("/api/push/vapid-key", (req, res) => {
  res.json({ key: vapidKeys.publicKey });
});

app.post("/api/push/subscribe", (req, res) => {
  const { subscription, time, genre } = req.body;
  subs = subs.filter(s => s.subscription.endpoint !== subscription.endpoint);
  subs.push({ subscription, time: time || "08:00", genre: genre || "mix", subscribedAt: new Date().toISOString() });
  saveSubs();
  res.json({ success: true });
});

app.post("/api/push/unsubscribe", (req, res) => {
  const { endpoint } = req.body;
  subs = subs.filter(s => s.subscription.endpoint !== endpoint);
  saveSubs();
  res.json({ success: true });
});

app.post("/api/push/test", async (req, res) => {
  const { subscription, genre } = req.body;
  try {
    const prompt = buildPrompt({ mood: "", energy: "5", stress: "5", motivation: "5", emotions: [], recentQuotes: [], genre: genre || "mix", isNightMode: false });
    const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 512, messages: [{ role: "user", content: prompt }] });
    const quote = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
    await webPush.sendNotification(subscription, JSON.stringify({
      title: "✨ 今日の名言",
      body: `"${quote.original.slice(0, 80)}" — ${quote.authorJp || quote.author}`,
      icon: "/icon-192.png",
      data: quote,
    }));
    res.json({ success: true, quote });
  } catch (err) {
    console.error("push test error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Daily cron: 毎分チェック、設定時刻に送信 ──────────────────────
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const toNotify = subs.filter(s => s.time === currentTime);
  if (!toNotify.length) return;

  for (const sub of toNotify) {
    try {
      const prompt = buildPrompt({ mood: "", energy: "5", stress: "5", motivation: "5", emotions: [], recentQuotes: [], genre: sub.genre || "mix", isNightMode: false });
      const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 512, messages: [{ role: "user", content: prompt }] });
      const quote = JSON.parse(msg.content[0].text.match(/\{[\s\S]*\}/)[0]);
      await webPush.sendNotification(sub.subscription, JSON.stringify({
        title: "✨ 今日の名言",
        body: `"${quote.original.slice(0, 80)}" — ${quote.authorJp || quote.author}`,
        icon: "/icon-192.png",
        data: quote,
      }));
    } catch (err) {
      if (err.statusCode === 410) {
        subs = subs.filter(s => s.subscription.endpoint !== sub.subscription.endpoint);
        saveSubs();
      }
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => { console.log(`\n✨ 名言アプリ起動中: http://localhost:${PORT}\n`); });
