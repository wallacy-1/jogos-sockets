import { JSendStatusEnum } from '../enums';

//=> https://github.com/omniti-labs/jsend
export interface JSendReturnData<T> {
  status: JSendStatusEnum;
  data?: T;
  code?: string;
}
