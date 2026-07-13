import type { Edit, EditDto } from './edit';
import { UpdateEdit } from './updateEdit';
import { DeleteEdit } from './deleteEdit';
import { InsertEdit } from './insertEdit';

/** Rebuilds edit Commands from the plain DTOs sent by the webview. */
export class EditFactory {
  static fromDto(dto: EditDto): Edit {
    switch (dto.op) {
      case 'update':
        return new UpdateEdit(dto.pk, dto.set);
      case 'delete':
        return new DeleteEdit(dto.pk);
      case 'insert':
        return new InsertEdit(dto.values);
    }
  }
}
