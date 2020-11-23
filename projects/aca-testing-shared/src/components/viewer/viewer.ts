/*!
 * @license
 * Alfresco Example Content Application
 *
 * Copyright (C) 2005 - 2020 Alfresco Software Limited
 *
 * This file is part of the Alfresco Example Content Application.
 * If the software was purchased under a paid Alfresco license, the terms of
 * the paid license agreement will prevail.  Otherwise, the software is
 * provided under the following open source license terms:
 *
 * The Alfresco Example Content Application is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Alfresco Example Content Application is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Alfresco. If not, see <http://www.gnu.org/licenses/>.
 */

import { browser, by, element, ElementFinder } from 'protractor';
import { BrowserActions, Logger } from '@alfresco/adf-testing';
import { Component } from '../component';
import { Toolbar } from '../toolbar/toolbar';

export class Viewer extends Component {
  root = browser.$('adf-viewer');
  viewerLayout = this.byCss('.adf-viewer-layout-content');
  viewerContainer = this.byCss('.adf-viewer-content-container');
  closeButton = this.byCss('.adf-viewer-close-button');
  fileTitle = this.byCss('.adf-viewer__file-title');
  viewerExtensionContent = this.byCss('adf-preview-extension');
  pdfViewerContentPages = this.allByCss('.adf-pdf-viewer__content .page');

  toolbar = new Toolbar('adf-viewer');

  constructor(ancestor?: string) {
    super('adf-viewer', ancestor);
  }

  async waitForViewerToOpen() {
    try {
      await BrowserVidibility.waitUntilElementIsPresent(this.viewerContainer);
      await BrowserVidibility.waitUntilElementIsPresent(this.viewerLayout);
    } catch (error) {
      Logger.error('\n-----> catch waitForViewerToOpen <-----\n', error);
    }
  }

  async isViewerOpened() {
    return browser.isElementPresent(this.viewerLayout);
  }

  async isViewerToolbarDisplayed() {
    return browser.isElementPresent(this.toolbar.component);
  }

  async isCloseButtonDisplayed() {
    return browser.isElementPresent(this.closeButton);
  }

  async isFileTitleDisplayed() {
    return browser.isElementPresent(this.fileTitle);
  }

  async getCloseButtonTooltip(): Promise<string> {
    return this.toolbar.getButtonTooltip(this.closeButton);
  }

  async getFileTitle(): Promise<string> {
    return this.fileTitle.getText();
  }

  async isCustomContentPresent() {
    return browser.isElementPresent(this.viewerExtensionContent);
  }

  async getComponentIdOfView(): Promise<string> {
    if (await this.isCustomContentPresent()) {
      return this.viewerExtensionContent.getAttribute('data-automation-id');
    }

    return '';
  }

  async isPdfViewerContentDisplayed(): Promise<boolean> {
    const count = await this.pdfViewerContentPages.count();
    return count > 0;
  }

  async clickDownloadButton(): Promise<void> {
    const downloadButton: ElementFinder = element(by.id(`app.viewer.download`));
    await BrowserActions.click(downloadButton);
  }

  async clickCloseButton(): Promise<void> {
    const closeButton: ElementFinder = element(by.css('button[data-automation-id="adf-toolbar-back"]'));
    await BrowserActions.click(closeButton);
  }
}
