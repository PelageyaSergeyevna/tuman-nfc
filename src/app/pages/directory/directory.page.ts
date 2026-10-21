import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, saveOutline, searchOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { FeedbackService } from '../../core/feedback.service';
import { UsersService } from '../../core/users.service';
import { AppUser, DEPARTMENTS, ROLE_LABELS, UserRole } from '../../core/models';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-directory',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonContent,
    IonIcon,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  templateUrl: './directory.page.html',
  styleUrl: './directory.page.scss' })
export class DirectoryPage implements OnInit, OnDestroy {
  private readonly usersService = inject(UsersService);
  private readonly feedback = inject(FeedbackService);
  readonly auth = inject(AuthService);

  readonly users = computed(() => this.usersService.users());

  readonly isHR = computed(() => this.auth.role() === 'hr');

  readonly roles: UserRole[] = ['hr', 'manager', 'employee'];
  readonly roleLabels = ROLE_LABELS;
  readonly departments = DEPARTMENTS;

  search = '';
  readonly editing = signal<AppUser | null>(null);
  readonly showForm = signal(false);

  // Draft fields for the create / edit form.
  draftUid = '';
  draftEmployeeId = '';
  draftName = '';
  draftEmail = '';
  draftRole: UserRole = 'employee';
  draftDepartment = '';
  draftPosition = '';
  draftPhone = '';

  constructor() {
    addIcons({
      'create-outline': createOutline,
      'save-outline': saveOutline,
      'search-outline': searchOutline });
  }

  ngOnInit(): void {
    this.usersService.listen(this.auth.role() === 'hr' ? 'all' : 'department');
  }

  ngOnDestroy(): void {
    this.usersService.stop();
  }

  readonly filtered = computed(() => {
    const term = this.search.trim().toLowerCase();
    if (!term) {
      return this.users();
    }
    return this.users().filter(
      (u) =>
        u.displayName?.toLowerCase().includes(term) ||
        u.employeeId?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.position?.toLowerCase().includes(term),
    );
  });

  startCreate(): void {
    this.editing.set(null);
    this.draftUid = '';
    this.draftEmployeeId = '';
    this.draftName = '';
    this.draftEmail = '';
    this.draftRole = 'employee';
    this.draftDepartment = this.auth.department() ?? 'IT';
    this.draftPosition = '';
    this.draftPhone = '';
    this.showForm.set(true);
  }

  startEdit(user: AppUser): void {
    this.editing.set(user);
    this.draftUid = user.uid;
    this.draftEmployeeId = user.employeeId;
    this.draftName = user.displayName;
    this.draftEmail = user.email;
    this.draftRole = user.role;
    this.draftDepartment = user.department;
    this.draftPosition = user.position ?? '';
    this.draftPhone = user.phone ?? '';
    this.showForm.set(true);
  }

  cancel(): void {
    this.showForm.set(false);
    this.editing.set(null);
  }

  async save(): Promise<void> {
    if (!this.draftName.trim() || !this.draftEmployeeId.trim() || !this.draftEmail.trim()) {
      await this.feedback.error('Name, employee code and email are required.');
      return;
    }
    try {
      await this.usersService.save({
        uid: this.draftUid,
        employeeId: this.draftEmployeeId.trim().toUpperCase(),
        displayName: this.draftName.trim(),
        email: this.draftEmail.trim(),
        role: this.draftRole,
        department: this.draftDepartment,
        position: this.draftPosition.trim(),
        phone: this.draftPhone.trim(),
        isActive: this.editing()?.isActive ?? true });
      await this.feedback.success('Employee saved.');
      this.cancel();
    } catch (err) {
      await this.feedback.error(err instanceof Error ? err.message : 'Could not save the employee.');
    }
  }
}
