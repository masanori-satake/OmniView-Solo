const translations = {
  ja: {
    usage: "使い方",
    privacy: "プライバシーポリシー",
    langEn: "English",
    langJa: "日本語",
    tagline: "〜リモート授業やハイブリッド会議のUXを向上させる〜",
    cta: "Chrome ウェブストアで追加",
    projectOverview: "プロジェクト概要",
    overviewText: "OmniView-Soloは、リモート授業やハイブリッド会議において、教室や会議室の教材（ノート、テキストなど）やホワイトボードの様子を生徒やリモートメンバーへ非常に見やすくクリアに共有し、全体のUXを向上させるためのChrome拡張機能です。斜めからの映像を正面に直す「歪みの補正」や、教材やホワイトボード前の人を自動で消す「写り込みの除去」などの処理を、すべてお使いのブラウザ上（完全ローカル）で安全・低負荷に行うことができます。",
    features: "特徴",
    featurePerspective: "射影変換",
    featurePerspectiveText: "斜めから撮影された教材やホワイトボードを、正面から見たような綺麗な長方形に補正します。",
    featureOcclusion: "写り込み除去",
    featureOcclusionText: "時間的中央値フィルタにより、教材やホワイトボードの前を横切る人や腕を自動的に排除します。",
    featureLocal: "完全ローカル実行",
    featureLocalText: "すべての画像処理はブラウザ内で行われ、外部サーバーへデータを送信することはありません。",
    featureM3: "Material 3 UI",
    featureM3Text: "Google Material 3 デザインに準拠した直感的でモダンなインターフェースを提供します。",
    install: "インストール方法",
    installStep1: "Chrome ウェブストアにアクセスします。",
    installStep2: "「Chromeに追加」ボタンをクリックします。",
    installStep3: "サイドパネルから OmniView-Solo を起動し、カメラを選択して教材・ホワイトボード補正を開始しましょう。",
    privacyTitle: "プライバシーポリシー",
    dataCollectionTitle: "データの収集と利用",
    dataCollectionText: "OmniView-Soloは、ユーザーのプライバシーを最優先に設計されています。本拡張機能は、ユーザーのいかなる個人情報も収集、保存、または外部サーバーへ送信することはありません。",
    cameraAccessTitle: "カメラへのアクセス",
    cameraAccessText: "本拡張機能は、教材やホワイトボードの映像を取得し画像処理を行うためにカメラへのアクセス権限を必要とします。取得された映像データはすべてブラウザ上のメモリ内で処理され、外部に送信されることはありません。",
    localStorageTitle: "ローカルストレージの利用",
    localStorageText: "カメラの設定（モードやカスタムラベルなど）は、ブラウザのローカルストレージ（chrome.storage.local）に保存されます。これらは利便性の向上のみを目的としており、外部からアクセスされることはありません。",
    thirdPartyTitle: "第三者への提供",
    thirdPartyText: "収集するデータ自体が存在しないため、第三者への提供や販売を行うことはありません。",
    usageTitle: "使い方",
    step1Title: "1. サイドパネルを開く",
    step1Text: "ブラウザの拡張機能アイコンをクリックし、OmniView-Soloを選択してサイドパネルを開きます。",
    step2Title: "2. カメラを追加する",
    step2Text: "「カメラを追加」ボタンを押し、使用したいカメラを選択します。",
    step3Title: "3. 教材・ホワイトボード補正",
    step3Text: "モードを「Whiteboard」に設定し、映像上の4点を教材（ノート、テキストなど）やホワイトボードの四隅に合わせます。「Occlusion Removal」をONにすると、写り込んだ人を自動で消去します。",
    step4Title: "4. 画像をキャプチャする",
    step4Text: "授業や会議の最後に「Capture」ボタンを押すと、補正された画像がクリップボードにコピーされます。そのままチャットツール等に貼り付けることができます。",
    copyright: "&copy; 2026 OmniView-Solo. All rights reserved."
  },
  en: {
    usage: "Usage",
    privacy: "Privacy Policy",
    langEn: "English",
    langJa: "Japanese",
    tagline: "Improve UX for remote classes and hybrid meetings.",
    cta: "Add to Chrome",
    projectOverview: "Project Overview",
    overviewText: "OmniView-Solo is a Chrome extension designed to share teaching materials (notebooks, textbooks, etc.) and whiteboard images beautifully and clearly with students and remote participants in remote classes and hybrid meetings, improving the overall experience. It performs helpful corrections, such as correcting angled views (perspective correction) and clearing out passing people (occlusion removal) - all processed securely and smoothly inside your local browser.",
    features: "Features",
    featurePerspective: "Perspective Transform",
    featurePerspectiveText: "Corrects distorted teaching material and whiteboard images taken from an angle into clean rectangles as if viewed from the front.",
    featureOcclusion: "Occlusion Removal",
    featureOcclusionText: "Uses a temporal median filter to automatically eliminate people or arms passing in front of the teaching material or whiteboard.",
    featureLocal: "Fully Local Execution",
    featureLocalText: "All image processing is done within the browser; no data is ever sent to external servers.",
    featureM3: "Material 3 UI",
    featureM3Text: "Provides an intuitive and modern interface compliant with Google Material 3 design.",
    install: "Installation",
    installStep1: "Visit the Chrome Web Store.",
    installStep2: "Click the 'Add to Chrome' button.",
    installStep3: "Launch OmniView-Solo from the side panel, select your camera, and start enhancing your teaching material and whiteboard.",
    privacyTitle: "Privacy Policy",
    dataCollectionTitle: "Data Collection and Use",
    dataCollectionText: "OmniView-Solo is designed with user privacy as the top priority. This extension does not collect, store, or transmit any personal information to external servers.",
    cameraAccessTitle: "Camera Access",
    cameraAccessText: "This extension requires camera access to capture teaching materials and whiteboard images for processing. All captured video data is processed in browser memory and is never transmitted externally.",
    localStorageTitle: "Local Storage Use",
    localStorageText: "Camera settings (modes, custom labels, etc.) are stored in the browser's local storage (chrome.storage.local). These are used solely for improving user convenience and are not accessible from outside.",
    thirdPartyTitle: "Disclosure to Third Parties",
    thirdPartyText: "Since no data is collected, we do not provide or sell any data to third parties.",
    usageTitle: "How to Use",
    step1Title: "1. Open the Side Panel",
    step1Text: "Click the extension icon in your browser and select OmniView-Solo to open the side panel.",
    step2Title: "2. Add a Camera",
    step2Text: "Click the 'Add Camera' button and select the camera you want to use.",
    step3Title: "3. Teaching Material & Whiteboard Enhancement",
    step3Text: "Set the mode to 'Whiteboard' and align the four points on the video with the corners of the teaching material or whiteboard. Turn on 'Occlusion Removal' to automatically clear people from the view.",
    step4Title: "4. Capture Image",
    step4Text: "At the end of a class or meeting, click the 'Capture' button to copy the enhanced image to your clipboard. You can then paste it directly into your chat tools.",
    copyright: "&copy; 2026 OmniView-Solo. All rights reserved."
  }
};

function setLanguage(lang) {
  const targetLang = translations[lang] ? lang : "en";
  try {
    localStorage.setItem("preferred-lang", targetLang);
  } catch (e) {
    // Ignore storage errors
  }
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (translations[targetLang][key]) {
      el.innerHTML = translations[targetLang][key];
    }
  });
  document.querySelectorAll(".lang-switch").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-lang") === targetLang);
  });
  document.documentElement.lang = targetLang;
}

document.addEventListener("DOMContentLoaded", () => {
  let savedLang = "en";
  try {
    savedLang = localStorage.getItem("preferred-lang");
    if (!savedLang) {
      savedLang = navigator.language.startsWith("ja") ? "ja" : "en";
    }
  } catch (e) {
    savedLang = navigator.language.startsWith("ja") ? "ja" : "en";
  }
  setLanguage(savedLang);

  document.querySelectorAll(".lang-switch").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLanguage(btn.getAttribute("data-lang"));
    });
  });
});
