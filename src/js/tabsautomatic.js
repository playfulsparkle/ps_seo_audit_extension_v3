/*
 *   This content is licensed according to the W3C Software License at
 *   https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document
 *
 *   File:   tabs-automatic.js
 *
 *   Desc:   Tablist widget that implements ARIA Authoring Practices
 */
"use strict";

class TabsAutomatic {
  constructor(groupNode) {
    if (!groupNode) {
      return;
    }

    this.tablistNode = groupNode;

    this.tabs = [];

    this.firstTab = null;
    this.lastTab = null;

    this.tabs = Array.from(this.tablistNode.querySelectorAll('[role=tab]'));
    this.tabpanels = [];

    for (let index = 0; index < this.tabs.length; index += 1) {
      const tab = this.tabs[index];
      const tabpanel = document.querySelector("#" + tab.getAttribute('aria-controls'));

      tab.tabIndex = -1;
      tab.setAttribute('aria-selected', 'false');

      if (!tabpanel) {
        tab.setAttribute("disabled", "disabled");
      }

      this.tabpanels.push(tabpanel);

      tab.addEventListener('keydown', this.onKeydown.bind(this));
      tab.addEventListener('click', this.onClick.bind(this));

      if (!this.firstTab && tabpanel) {
        this.firstTab = tab;
      }

      if (tabpanel) {
        this.lastTab = tab;
      }
    }

    this.setSelectedTab(this.firstTab, false);
  }

  setSelectedTab(currentTab, setFocus) {
    if (typeof setFocus !== 'boolean') {
      setFocus = true;
    }

    for (let index = 0; index < this.tabs.length; index += 1) {
      const tab = this.tabs[index];
      const tabPanel = this.tabpanels[index];

      if (!tabPanel) {
        continue;
      }

      if (currentTab === tab) {
        tab.setAttribute('aria-selected', 'true');
        tab.removeAttribute('tabindex');

        tabPanel.style.display = "flex";
        tabPanel.setAttribute('aria-hidden', 'false');

        if (setFocus) {
          tab.focus();
        }
      } else {
        tab.setAttribute('aria-selected', 'false');
        tab.tabIndex = -1;

        tabPanel.style.display = "none";
        tabPanel.setAttribute('aria-hidden', 'true');
      }
    }
  }

  setSelectedToPreviousTab(currentTab) {
    let index;

    if (currentTab === this.firstTab) {
      this.setSelectedTab(this.lastTab);
    } else {
      index = this.tabs.indexOf(currentTab);
      this.setSelectedTab(this.tabs[index - 1]);
    }
  }

  setSelectedToNextTab(currentTab) {
    let index;

    if (currentTab === this.lastTab) {
      this.setSelectedTab(this.firstTab);
    } else {
      index = this.tabs.indexOf(currentTab);
      this.setSelectedTab(this.tabs[index + 1]);
    }
  }

  /* EVENT HANDLERS */

  onKeydown(event) {
    const tgt = event.currentTarget;
    let flag = false;

    switch (event.key) {
      case 'ArrowLeft':
        this.setSelectedToPreviousTab(tgt);
        flag = true;
        break;

      case 'ArrowRight':
        this.setSelectedToNextTab(tgt);
        flag = true;
        break;

      case 'Home':
        this.setSelectedTab(this.firstTab);
        flag = true;
        break;

      case 'End':
        this.setSelectedTab(this.lastTab);
        flag = true;
        break;

      default:
        break;
    }

    if (flag) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  onClick(event) {
    this.setSelectedTab(event.currentTarget);
  }
}
