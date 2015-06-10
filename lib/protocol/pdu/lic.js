/*
 * Copyright (c) 2014-2015 Sylvain Peyrefitte
 *
 * This file is part of node-rdp.
 *
 * node-rdp is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var type = require('../../core').type;

var MESSAGE_TYPE = {
    LICENSE_REQUEST : 0x01,
    PLATFORM_CHALLENGE : 0x02,
    NEW_LICENSE : 0x03,
    UPGRADE_LICENSE : 0x04,
    LICENSE_INFO : 0x12,
    NEW_LICENSE_REQUEST : 0x13,
    PLATFORM_CHALLENGE_RESPONSE : 0x15,
    ERROR_ALERT : 0xFF
};
    
/**
 * @see http://msdn.microsoft.com/en-us/library/cc240482.aspx
 */
var ERROR_CODE = {
    ERR_INVALID_SERVER_CERTIFICATE : 0x00000001,
    ERR_NO_LICENSE : 0x00000002,
    ERR_INVALID_SCOPE : 0x00000004,
    ERR_NO_LICENSE_SERVER : 0x00000006,
    STATUS_VALID_CLIENT : 0x00000007,
    ERR_INVALID_CLIENT : 0x00000008,
    ERR_INVALID_PRODUCTID : 0x0000000B,
    ERR_INVALID_MESSAGE_LEN : 0x0000000C,
    ERR_INVALID_MAC : 0x00000003
};

/**
 * @see http://msdn.microsoft.com/en-us/library/cc240482.aspx
 */
var STATE_TRANSITION = {
    ST_TOTAL_ABORT : 0x00000001,
    ST_NO_TRANSITION : 0x00000002,
    ST_RESET_PHASE_TO_START : 0x00000003,
    ST_RESEND_LAST_MESSAGE : 0x00000004
};

/**
 * @see http://msdn.microsoft.com/en-us/library/cc240481.aspx
 */
var BINARY_BLOB_TYPE = {
    BB_ANY_BLOB : 0x0000,
    BB_DATA_BLOB : 0x0001,
    BB_RANDOM_BLOB : 0x0002,
    BB_CERTIFICATE_BLOB : 0x0003,
    BB_ERROR_BLOB : 0x0004,
    BB_ENCRYPTED_DATA_BLOB : 0x0009,
    BB_KEY_EXCHG_ALG_BLOB : 0x000D,
    BB_SCOPE_BLOB : 0x000E,
    BB_CLIENT_USER_NAME_BLOB : 0x000F,
    BB_CLIENT_MACHINE_NAME_BLOB : 0x0010
};

var PREAMBULE = {
    PREAMBLE_VERSION_2_0 : 0x2,
    PREAMBLE_VERSION_3_0 : 0x3,
    EXTENDED_ERROR_MSG_SUPPORTED : 0x80
};

/**
 * Binary blob to emcompass license information
 * @see http://msdn.microsoft.com/en-us/library/cc240481.aspx
 * @param blobType {BINARY_BLOB_TYPE.*}
 * @returns {type.Component}
 */
function licenseBinaryBlob(blobType) {
	blobType = blobType || BINARY_BLOB_TYPE.BB_ANY_BLOB;
	var self = {
		wBlobType : new type.UInt16Le(blobType, { constant : (blobType == BINARY_BLOB_TYPE.BB_ANY_BLOB)?false:true }),
        wBlobLen : new type.UInt16Le(function() {
        	return self.blobData.size();
        }),
        blobData : new type.BinaryString(null, { readLength : function() {
        	return self.wBlobLen.value;
        }})
	};
	
	return new type.Component(self);
}

/**
 * Error message in license PDU automata
 * @param opt {object} type options
 * @returns {type.Component}
 */
function licensingErrorMessage(opt) {
	var self = {
		__TYPE__ : MESSAGE_TYPE.ERROR_ALERT,
		dwErrorCode : new type.UInt32Le(),
        dwStateTransition : new type.UInt32Le(),
        blob : licenseBinaryBlob(BINARY_BLOB_TYPE.BB_ANY_BLOB)
	};
	
	return new type.Component(self, opt);
}

/**
 * Global license packet
 * @returns {type.Component}
 */
function licensePacket() {
	var self = {
		bMsgtype : new type.UInt8(function() {
			return self.licensingMessage._TYPE_;
		}),
        flag : new type.UInt8(PREAMBULE.PREAMBLE_VERSION_3_0),
        wMsgSize : new type.UInt16Le(function() {
        	return new type.Component(self).size();
        }),
        licensingMessage : new type.Factory(function(s) {
        	switch(self.bMsgtype.value) {
        	case MESSAGE_TYPE.ERROR_ALERT:
        		self.licensingMessage = licensingErrorMessage().read(s);
        		break;
        	default:
        		throw 'NODE_RDP_PROTOCOL_PDU_LIC_UNHANDLE_MESSAGE_TYPE';	
        	}
        })
	};
	
	return new type.Component(self);
}

/**
 * Module exports
 */
module.exports = {
		licensePacket : licensePacket
};