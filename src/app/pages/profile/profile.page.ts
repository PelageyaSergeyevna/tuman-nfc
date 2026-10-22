/** The signed-in user's own profile: display name and phone. */
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { saveOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { FeedbackService } from '../../core/feedback.service';
import { ROLE_LABELS } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, IonButton, IonContent, IonIcon, PageHeaderComponent],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage {
  readonly auth = inject(AuthService);
  private readonly feedback = inject(FeedbackService);

  displayName = '';
  phone = '';
  private initialised = false;

  readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });

  constructor() {
    addIcons({ 'save-outline': saveOutline });
  }

  /** Copy the profile into the form once; later calls are no-ops. */
  sync(): void {
    if (this.initialised) {
      return;
    }
    this.initialised = true;
    this.displayName = this.auth.profile()?.displayName ?? '';
    this.phone = this.auth.profile()?.phone ?? '';
  }

  async save(): Promise<void> {
    const error = await this.auth.updateOwnProfile({
      displayName: this.displayName.trim(),
      phone: this.phone.trim(),
    });
    if (error) {
      await this.feedback.error(error);
      return;
    }
    await this.feedback.success('Profile updated.');
  }
}
