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

var type = require('../core').type;
var x509 = require('../security').x509;
var asn1 = require('../asn1');

/**
 *  @see http://msdn.microsoft.com/en-us/library/cc240521.aspx
 */
var CERTIFICATE_TYPE = {
    CERT_CHAIN_VERSION_1 : 0x00000001,
    CERT_CHAIN_VERSION_2 : 0x00000002
};

/**
 * @see http://msdn.microsoft.com/en-us/library/cc240520.aspx
 * @returns
 */
function rsaPublicKey(opt) {
	var self = {
		magic : new type.UInt32Le(0x31415352, { constant : true }),
        keylen : new type.UInt32Le(function() {
        	return self.modulus.size() + self.paddinf.size();
        }),
        bitlen : new type.UInt32Le(function() {
        	return (self.keylen.value - 8) * 8;
        }),
        datalen : new type.UInt32Le(function() {
        	return (self.bitlen.value / 8) - 1;
        }),
        pubExp : new type.UInt32Le(),
        modulus : new type.BinaryString(null, { readLength : new type.CallableValue(function() {
        	return self.keylen.value - 8;
        }) }),
        padding : new type.BinaryString(new Buffer(Array(8 + 1).join('\x00')), { readLength : new type.CallableValue(8) })
	};
	
	return new type.Component(self, opt);
}

/**
 * http://msdn.microsoft.com/en-us/library/cc240519.aspx
 * @returns {type.Component}
 */
function proprietaryCertificate() {
	var self = {
		__TYPE__ : CERTIFICATE_TYPE.CERT_CHAIN_VERSION_1,
		dwSigAlgId : new type.UInt32Le(0x00000001, { constant : true }),
        dwKeyAlgId : new type.UInt32Le(0x00000001, { constant : true }),
        wPublicKeyBlobType : new type.UInt16Le(0x0006, { constant : true }),
        wPublicKeyBlobLen : new type.UInt16Le(function() {
        	return self.PublicKeyBlob.size();
        }),
        PublicKeyBlob : rsaPublicKey({ readLength : new type.CallableValue(function() {
        	return self.wPublicKeyBlobLen.value;
        }) }),
        wSignatureBlobType : new type.UInt16Le(0x0008, { constant : true }),
        wSignatureBlobLen : new type.UInt16Le(function() {
        	return self.SignatureBlob.size() + self.padding.size();
        }),
        SignatureBlob : new type.BinaryString(null, { readLength : new type.CallableValue(function() {
        	return self.wSignatureBlobLen.value - self.padding.size;
        }) }),
        padding : new type.BinaryString(Array(8 + 1).join('\x00'), { readLength : new type.CallableValue(8) })
	};
	
	return new type.Component(self);
}

/**
 * For x509 certificate
 * @see http://msdn.microsoft.com/en-us/library/cc241911.aspx
 * @returns {type.Component}
 */
function certBlob() {
	var self = {
		cbCert : new type.UInt32Le(function() {
			return self.abCert.size();
		}),
        abCert : new type.BinaryString(null, { readLength : new type.CallableValue(function() {
        	return self.cbCert.value;
        }) })
	};
	
	return new type.Component(self);
}

/**
 * x509 certificate chain
 * @see http://msdn.microsoft.com/en-us/library/cc241910.aspx
 * @returns {type.Component}
 */
function x509CertificateChain() {
	var self = {
		__TYPE__ : CERTIFICATE_TYPE.CERT_CHAIN_VERSION_2,
		NumCertBlobs : new type.UInt32Le(),
        CertBlobArray : new type.Factory(function(s) {
        	self.CertBlobArray = new type.Component([]);
        	for(var i = 0; i < self.NumCertBlobs.value; i++) {
        		self.CertBlobArray.obj.push(certBlob().read(s));
        	}
        }),
        padding : new type.BinaryString(null, { readLength : new type.CallableValue(function() {
        	return 8 + 4 * self.NumCertBlobs.value;
        }) }),
        getPublicKey : function(){
        	var cert = x509.X509Certificate().decode(new type.Stream(self.CertBlobArray.obj[self.CertBlobArray.obj.length - 1].obj.abCert.value), asn1.ber);
        	var publikeyStream = new type.Stream(cert.value.tbsCertificate.value.subjectPublicKeyInfo.value.subjectPublicKey.toBuffer());
        	x509.RSAPublicKey().decode(publikeyStream, asn1.ber);
        }
	};
	
	return new type.Component(self);
}

function certificate() {
	var self = {
		dwVersion : new type.UInt32Le(function() {
			return self.certData.__TYPE__;
		}),
		certData : new type.Factory(function(s) {
			switch(self.dwVersion.value & 0x7fffffff) {
			case CERTIFICATE_TYPE.CERT_CHAIN_VERSION_1:
				self.certData = proprietaryCertificate().read(s);
				break;
			// Actually not supported
			case CERTIFICATE_TYPE.CERT_CHAIN_VERSION_2:
				self.certData = x509CertificateChain().read(s);
				break;
			default:
				throw 'NODE_RDP_PROTOCOL_CERT_INVALID_TYPE';
			}
		})
	};
	
	return new type.Component(self);
}

/**
 * Module exports
 */
module.exports = {
	CERTIFICATE_TYPE : CERTIFICATE_TYPE,
	certificate : certificate
};