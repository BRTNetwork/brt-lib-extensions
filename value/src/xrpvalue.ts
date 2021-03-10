import BigNumber from 'bignumber.js'
import {Value} from './value'

const IOUNumber = BigNumber.clone({
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  DECIMAL_PLACES: 40
});

const brtUnits = new IOUNumber(1e6);

class BRTValue extends Value {

  constructor(value: string | BigNumber) {
    super(value);
    if (this._value.dp() > 6) {
      throw new Error(
        'Value has more than 6 digits of precision past the decimal point, '
          + 'an IOUValue may be being cast to an BRTValue'
        );
    }
  }

  multiply(multiplicand: Value) {
    if (multiplicand instanceof BRTValue) {
      return super.multiply(
        new BRTValue(multiplicand._value.times(brtUnits)));
    }
    return super.multiply(multiplicand);
  }

  divide(divisor: Value) {
    if (divisor instanceof BRTValue) {
      return super.divide(
        new BRTValue(divisor._value.times(brtUnits)));
    }
    return super.divide(divisor);
  }

  negate() {
    return new BRTValue(this._value.negated());
  }

  _canonicalize(value) {
    if (value.isNaN()) {
      throw new Error('Invalid result');
    }
    return new BRTValue(value.decimalPlaces(6, BigNumber.ROUND_DOWN));
  }

  equals(comparator) {
    return (comparator instanceof BRTValue)
      && this._value.isEqualTo(comparator._value);
  }
}

export {BRTValue}
