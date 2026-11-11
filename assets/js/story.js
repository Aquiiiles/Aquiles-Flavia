// Fotos da seção "Nossa história": usa `storyPhotos` do config.js ou,
// enquanto não houver fotos, mostra molduras de "fotos em breve".
(() => {
  const cfg = window.WEDDING_CONFIG;
  const box = document.querySelector("#story-photos");
  const photos = cfg.storyPhotos || [];

  if (photos.length) {
    box.replaceChildren(
      ...photos.map((p) => {
        const fig = document.createElement("figure");
        fig.className = "story-photo";
        const img = document.createElement("img");
        img.src = p.src;
        img.alt = p.alt || "Aquiles e Flavia";
        img.loading = "lazy";
        fig.appendChild(img);
        return fig;
      })
    );
    return;
  }

  const slots = Array.from({ length: cfg.storyPhotoSlots || 3 }, () => {
    const fig = document.createElement("figure");
    fig.className = "story-photo story-photo-empty";
    fig.setAttribute("aria-hidden", "true");
    const span = document.createElement("span");
    span.textContent = "Fotos em breve";
    fig.appendChild(span);
    return fig;
  });
  box.replaceChildren(...slots);
})();
