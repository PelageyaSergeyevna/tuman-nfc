import { Routes } from '@angular/router';

import { sharedRoutes } from './routes/shared.routes';
/**
 * The screens that only exist in one surface.
 *
 * This file is replaced for the phone build (see `angular.json`), so the
 * console screens are not part of the phone app.
 */
import { surfaceRoutes } from './routes/surface.routes';

export const routes: Routes = [...sharedRoutes(), ...surfaceRoutes()];
