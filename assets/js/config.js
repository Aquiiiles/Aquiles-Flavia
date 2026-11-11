// Configurações do casamento. Edite aqui sem mexer no resto do código.
window.WEDDING_CONFIG = {
  // URL do Web App publicado no Google Apps Script (veja o README).
  // Enquanto estiver vazio, o formulário fica desativado com um aviso.
  // Para testar localmente use `node dev/server.js` (veja o README).
  apiUrl: "https://script.google.com/macros/s/AKfycbyDanqZ1sWej2qhazu13a3YEXbMLqsMcIQHa2QOMgFgcDGCpt0PXHFfY2HUq359is4_Qg/exec",

  // Data/hora da cerimônia no formato ISO (usado na contagem regressiva).
  date: "2027-08-19T16:00:00-03:00",
  dateLabel: "19 de agosto de 2027",
  timeLabel: "16h00",

  venueName: "Villa Fontana",
  venueAddress: "Rio de Janeiro - RJ",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Villa+Fontana+Rio+de+Janeiro",

  dressCode: "Traje esporte fino",

  rsvpDeadlineLabel: "19 de junho de 2027",

  // Fotos da seção "Nossa história". Coloque os arquivos em assets/img/historia/
  // e liste aqui, por exemplo:
  //   { src: "assets/img/historia/foto1.jpg", alt: "Aquiles e Flavia na praia" },
  // Enquanto a lista estiver vazia, aparecem molduras "fotos em breve".
  storyPhotos: [],
  storyPhotoSlots: 3,

  // Presente via Pix. Para esconder a seção, deixe `key` vazio.
  pix: {
    key: "22946f21-cb3c-4ba5-b720-43b1fce62bdb",
    // Nome e cidade vão dentro do código Pix (sem acento, até 25 e 15 letras).
    // O app do banco mostra o nome do titular da chave de qualquer forma.
    name: "Aquiles e Flavia",
    city: "Rio de Janeiro",
    description: "Presente casamento",
    suggestedAmounts: [100, 200, 300, 500],
  },

  // Máximo de acompanhantes por família (igual ao MAX_COMPANIONS do Code.gs).
  maxCompanions: 10,
};
