import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent } from '@ionic/angular';

import { FeedbackService } from '../../core/feedback.service';
import { ShiftService } from '../../core/shift.service';
import { ShiftSchedule } from '../../core/models';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-shifts',
  standalone: true,
  imports: [FormsModule, IonButton, IonContent, PageHeaderComponent],
  templateUrl: './shifts.page.html',
  styleUrl: './shifts.page.scss',
})
export class ShiftsPage implements OnInit {
  private readonly shiftService = inject(ShiftService);
  private readonly feedback = inject(FeedbackService);

  schedules: ShiftSchedule[] = [];

  ngOnInit(): void {
    this.schedules = this.shiftService.schedules().map((s) => ({ ...s }));
  }

  async save(): Promise<void> {
    try {
      for (const schedule of this.schedules) {
        await this.shiftService.save(schedule);
      }
      await this.feedback.success('Shift schedules saved.');
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not save the shifts.');
    }
  }
}
