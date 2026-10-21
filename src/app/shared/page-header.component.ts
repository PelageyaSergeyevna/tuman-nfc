/**
 * Shared page header.
 *
 * Every page uses this so the dark Tuman navbar, the menu button and the
 * back button stay consistent.
 */
import { Component, Input } from '@angular/core';
import {
  IonBackButton,
  IonButtons,
  IonHeader,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonMenuButton, IonBackButton],
  template: `
    <ion-header class="tuman-topbar">
      <ion-toolbar>
        <ion-buttons slot="start">
          @if (back) {
            <ion-back-button defaultHref="/dashboard" text=""></ion-back-button>
          } @else {
            <ion-menu-button></ion-menu-button>
          }
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons slot="end">
          <ng-content></ng-content>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() back = false;
}
