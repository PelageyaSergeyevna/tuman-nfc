/**
 * Toast + confirmation helpers.
 *
 * The legacy Tuman app used a custom "MessageBox" modal for feedback; the
 * hybrid app uses an Ionic toast for transient messages and a native alert
 * for confirmations.
 */
import { inject, Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly toast = inject(ToastController);
  private readonly alert = inject(AlertController);

  async success(message: string): Promise<void> {
    await this.show(message, 'success');
  }

  async error(message: string): Promise<void> {
    await this.show(message, 'danger');
  }

  async info(message: string): Promise<void> {
    await this.show(message, 'medium');
  }

  async show(message: string, color: 'success' | 'danger' | 'medium' | 'warning' = 'medium'): Promise<void> {
    const toast = await this.toast.create({
      message,
      duration: 2600,
      position: 'bottom',
      color,
      cssClass: 'tuman-toast',
    });
    await toast.present();
  }

  /** A yes/no dialog. Resolves to true when the user confirms. */
  async confirm(message: string, header = 'Please confirm'): Promise<boolean> {
    const alert = await this.alert.create({
      header,
      message,
      cssClass: 'tuman-alert',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Confirm', role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  /** A single-line prompt, used to collect an archive reason. */
  async prompt(header: string, placeholder: string): Promise<string | null> {
    const alert = await this.alert.create({
      header,
      inputs: [{ name: 'value', type: 'textarea', placeholder }],
      cssClass: 'tuman-alert',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Submit', role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role !== 'confirm') {
      return null;
    }
    const value = (result.data?.['value'] as string | undefined) ?? '';
    return value.trim() || null;
  }
}
