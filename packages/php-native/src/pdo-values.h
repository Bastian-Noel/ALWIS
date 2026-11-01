/* External-client PDO uses text buffers even for prepared result columns.
 * Convert only SQL numeric types, within the integer range of this PHP build.
 * Decimal, oversized integers, binary values and numeric-looking text stay exact.
 */
static void pbl_pdo_column(zval *value, const MYSQL_FIELD *field, const char *text, size_t length, bool stringify)
{
    if (!stringify) {
        zend_long integer; double decimal;
        switch (field->type) {
            case MYSQL_TYPE_TINY: case MYSQL_TYPE_SHORT: case MYSQL_TYPE_LONG:
            case MYSQL_TYPE_INT24: case MYSQL_TYPE_LONGLONG: case MYSQL_TYPE_YEAR:
                if (is_numeric_string(text, length, &integer, &decimal, 0) == IS_LONG) {
                    ZVAL_LONG(value, integer); return;
                }
                break;
            case MYSQL_TYPE_FLOAT: case MYSQL_TYPE_DOUBLE: {
                zend_uchar kind = is_numeric_string(text, length, &integer, &decimal, 0);
                if (kind == IS_LONG || kind == IS_DOUBLE) {
                    ZVAL_DOUBLE(value, kind == IS_LONG ? (double)integer : decimal); return;
                }
                break;
            }
            default: break;
        }
    }
    ZVAL_STRINGL_FAST(value, text, length);
}
