function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? String(e.parameter.page) : 'employee';
  var t = HtmlService.createTemplateFromFile('Ui_' + (page === 'admin' ? 'Admin' : page === 'login' ? 'Login' : 'Employee'));
  t.page = page;
  var html = t.evaluate();
  html.setTitle('HRIS');
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
