/**
 * Empty-state placeholder used by every list in the app.
 */
import { Component, Input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { documentOutline } from 'ionicons/icons';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [IonIcon],
  template: `
    <div class="tuman-empty">
      <ion-icon name="document-outline" class="tuman-empty-icon"></ion-icon>
      <div class="tuman-empty-title">{{ title }}</div>
      @if (message) {
        <div>{{ message }}</div>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() title = 'Nothing here yet';
  @Input() message = '';

  constructor() {
    addIcons({ 'document-outline': documentOutline });
  }
}
