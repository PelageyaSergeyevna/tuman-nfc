/**
 * The notice for employees in the phone app.
 *
 * The app on the phone is the scanner: HR Staff and Department Heads use it
 * to file check-ins. Everybody else works in the web console, so an employee
 * who signs in is sent here instead of the scanner.
 */
import { Component } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { globeOutline, informationCircleOutline } from 'ionicons/icons';

import { WEB_APP_URL } from '../../core/surface';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-staff-only',
  standalone: true,
  imports: [IonButton, IonContent, IonIcon, PageHeaderComponent],
  templateUrl: './staff-only.page.html',
})
export class StaffOnlyPage {
  readonly webAppUrl = WEB_APP_URL;

  constructor() {
    addIcons({
      'globe-outline': globeOutline,
      'information-circle-outline': informationCircleOutline,
    });
  }
}
