import { Module } from '@nestjs/common';
import { AdminOperationsController, AdminProjectsController } from './admin-projects.controller';
import {
  DeveloperOverviewController,
  DeveloperProjectsController,
} from './developer-projects.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [
    ProjectsController,
    DeveloperProjectsController,
    DeveloperOverviewController,
    AdminProjectsController,
    AdminOperationsController,
  ],
  providers: [ProjectsService],
})
export class ProjectsModule {}
