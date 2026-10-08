"use strict";

// Progressive enhancement: navigation and all resources work without JavaScript.
const menu = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#primary-nav");
if (menu && navigation) {
  const smallScreen = window.matchMedia("(max-width: 850px)");
  function setExpanded(expanded) {
    menu.setAttribute("aria-expanded", String(expanded));
    navigation.hidden = smallScreen.matches && !expanded;
  }
  function updateLayout() {
    menu.hidden = !smallScreen.matches;
    setExpanded(false);
  }
  updateLayout();
  smallScreen.addEventListener("change", updateLayout);
  menu.addEventListener("click", () =>
    setExpanded(menu.getAttribute("aria-expanded") !== "true"),
  );
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a") && smallScreen.matches) setExpanded(false);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menu.getAttribute("aria-expanded") === "true"
    ) {
      setExpanded(false);
      menu.focus();
    }
  });
}

const filters = document.querySelector(".resource-filters");
if (filters) {
  const search = document.querySelector("#resource-search");
  const category = document.querySelector("#resource-category");
  const cards = [...document.querySelectorAll(".resource-card")];
  const status = document.querySelector("#resource-status");
  const empty = document.querySelector("#resource-empty");
  function filterResources() {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const card of cards) {
      const visible =
        (!category.value || card.dataset.category === category.value) &&
        card.dataset.search.includes(query);
      card.hidden = !visible;
      if (visible) count++;
    }
    // Input is never rendered as HTML or sent to a server.
    status.textContent = `${count} ${count === 1 ? "resource" : "resources"} shown. Confirm details with each provider.`;
    empty.hidden = count > 0;
  }
  filters.hidden = false;
  search.addEventListener("input", filterResources);
  category.addEventListener("change", filterResources);
}
