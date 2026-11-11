// Configurações do casamento. Edite aqui sem mexer no resto do código.
window.WEDDING_CONFIG = {
  // URL do Web App publicado no Google Apps Script (veja o README).
  // Enquanto estiver vazio, o formulário fica desativado com um aviso.
  // Para testar localmente use `node dev/server.js` (veja o README).
  apiUrl: "",

  // Data/hora da cerimônia no formato ISO (usado na contagem regressiva).
  date: "2027-08-19T16:00:00-03:00",
  dateLabel: "19 de agosto de 2027",
  timeLabel: "16h00",

  venueName: "Villa Fontana",
  venueAddress: "Rio de Janeiro - RJ",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Villa+Fontana+Rio+de+Janeiro",

  dressCode: "Traje esporte fino",

  rsvpDeadlineLabel: "19 de junho de 2027",

  // Máximo de acompanhantes por família (igual ao MAX_COMPANIONS do Code.gs).
  maxCompanions: 10,
};
