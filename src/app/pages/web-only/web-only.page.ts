/**
 * The phone app has no screen for managing cards, shifts, people or
 * approvals. When a link to one of them is opened on the phone, this page
 * explains where the work is done instead.
 */
import { Component } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { globeOutline } from 'ionicons/icons';

import { WEB_APP_URL } from '../../core/surface';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-web-only',
  standalone: true,
  imports: [IonButton, IonContent, IonIcon, PageHeaderComponent],
  templateUrl: './web-only.page.html',
})
export class WebOnlyPage {
  readonly webAppUrl = WEB_APP_URL;

  constructor() {
    addIcons({ 'globe-outline': globeOutline });
  }
}
