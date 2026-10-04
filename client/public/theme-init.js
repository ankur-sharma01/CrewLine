// sets the saved theme before first paint so there's no flash in dark mode.
// separate file (not inline) so the CSP in vercel.json can block inline scripts.
try {
  var t = localStorage.getItem("theme");
  if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = t;
} catch (e) {}
